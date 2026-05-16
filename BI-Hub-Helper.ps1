#requires -Version 5.1
<#
  Servico local minimo para o BI's Hub abrir ficheiros .pbix com o Power BI Desktop
  ja instalado (evita o navegador encaminhar para a Microsoft Store).

  Uso: clique com o botao direito em BI-Hub-Helper.ps1 > Executar com PowerShell
       ou: powershell -NoProfile -ExecutionPolicy Bypass -File ".\BI-Hub-Helper.ps1"

  Mantenha esta janela aberta enquanto usa o hub no navegador. Ctrl+C para sair.

  Porta predefinida: 47821 (tem de coincidir com o index.html).
#>

param(
  [ValidateRange(1, 65535)]
  [int]$Port = 47821
)

$ErrorActionPreference = 'Stop'
$prefix = "http://127.0.0.1:$Port/"
$listener = New-Object System.Net.HttpListener

try {
  $listener.Prefixes.Add($prefix)
  $listener.Start()
}
catch {
  Write-Host "Nao foi possivel iniciar o servidor em $prefix" -ForegroundColor Red
  Write-Host $_.Exception.Message
  Write-Host ""
  Write-Host "Se for erro de permissao URL ACL, numa consola como Administrador:" -ForegroundColor Yellow
  Write-Host " netsh http add urlacl url=$prefix user=$env:USERDOMAIN\$env:USERNAME"
  Read-Host "Enter para sair"
  exit 1
}

function Add-CorsHeaders([System.Net.HttpListenerResponse]$Response) {
  $Response.AddHeader('Access-Control-Allow-Origin', '*')
  $Response.AddHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  $Response.AddHeader('Access-Control-Allow-Headers', '*')
}

function Write-TextResponse([System.Net.HttpListenerResponse]$Response, [int]$StatusCode, [string]$ContentType, [string]$Body) {
  Add-CorsHeaders $Response
  $Response.StatusCode = $StatusCode
  $Response.ContentType = $ContentType
  $bytes = [Text.Encoding]::UTF8.GetBytes($Body)
  $Response.ContentLength64 = $bytes.LongLength
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Write-EmptyResponse([System.Net.HttpListenerResponse]$Response, [int]$StatusCode) {
  Add-CorsHeaders $Response
  $Response.StatusCode = $StatusCode
  $Response.ContentLength64 = 0
}

Write-Host "BI Hub Helper a escutar em $prefix" -ForegroundColor Green
Write-Host "Abra o index.html no navegador e clique nos relatorios. Ctrl+C para terminar."
Write-Host ""

$script:OpenDedupePath = ''
$script:OpenDedupeUtc = [datetime]::MinValue

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $relPath = $req.Url.AbsolutePath.TrimEnd('/')

    try {
      if ($req.HttpMethod -eq 'OPTIONS') {
        Write-EmptyResponse $res 204
        continue
      }

      if ($relPath -eq '/api/ping') {
        Write-EmptyResponse $res 204
        continue
      }

      if ($relPath -eq '/api/open' -and $req.HttpMethod -eq 'GET') {
        $filePath = $req.QueryString['path']
        if ([string]::IsNullOrWhiteSpace($filePath)) {
          Write-TextResponse $res 400 'text/plain; charset=utf-8' 'Falta o parametro path.'
          continue
        }

        $ext = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
        if ($ext -ne '.pbix') {
          Write-TextResponse $res 400 'text/plain; charset=utf-8' 'Apenas ficheiros .pbix sao permitidos.'
          continue
        }

        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
          Write-TextResponse $res 404 'text/plain; charset=utf-8' 'Ficheiro nao encontrado.'
          continue
        }

        # Evita abrir o mesmo .pbix duas vezes quando o navegador dispara o GET em duplicado (poucos segundos).
        $nowUtc = [datetime]::UtcNow
        $skipLaunch = $false
        if ($filePath -eq $script:OpenDedupePath -and ($nowUtc - $script:OpenDedupeUtc).TotalSeconds -lt 2.5) {
          $skipLaunch = $true
        }
        else {
          $script:OpenDedupePath = $filePath
          $script:OpenDedupeUtc = $nowUtc
        }

        if (-not $skipLaunch) {
          try {
            Invoke-Item -LiteralPath $filePath -ErrorAction Stop
          }
          catch {
            Write-TextResponse $res 500 'text/plain; charset=utf-8' ("Erro ao abrir: " + $_.Exception.Message)
            continue
          }
        }

        $html = @'
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>BI Hub</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;background:#f8fafc;color:#0f172a">
<p style="margin:0;font-weight:600">Pedido enviado ao Windows para abrir o arquivo no Power BI Desktop.</p>
<p style="margin-top:0.75rem;font-size:14px;color:#64748b">Pode fechar esta guia; o hub continua na outra.</p>
<script>setTimeout(function(){ try { window.close(); } catch (e) {} }, 1200);</script>
</body></html>
'@
        Write-TextResponse $res 200 'text/html; charset=utf-8' $html
        continue
      }

      Write-TextResponse $res 404 'text/plain; charset=utf-8' 'Nao encontrado.'
    }
    finally {
      try { $res.OutputStream.Close() } catch { }
    }
  }
}
finally {
  try {
    $listener.Stop()
    $listener.Close()
  }
  catch { }
}
