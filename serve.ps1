param(
  [string]$Root = "$PSScriptRoot",
  [int]$Port = 8765
)
$Root = (Resolve-Path $Root).Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root on http://localhost:$Port/"

$mime = @{
  ".html" = "text/html"; ".css" = "text/css"; ".js" = "application/javascript"
  ".json" = "application/json"; ".png" = "image/png"; ".ico" = "image/x-icon"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $path = $req.Url.AbsolutePath
  if ($path -eq "/") { $path = "/index.html" }
  $file = Join-Path $Root ($path.TrimStart("/"))
  $res = $ctx.Response
  if (Test-Path $file -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($file)
    $ct = $mime[$ext]
    if (-not $ct) { $ct = "application/octet-stream" }
    $res.ContentType = $ct
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
  }
  $res.OutputStream.Close()
}
