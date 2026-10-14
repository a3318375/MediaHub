# Configure this process only; explicit deployment environment always wins.
$explicitProxy = @('PROXY','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY') | Where-Object { [Environment]::GetEnvironmentVariable($_) }
if (-not $explicitProxy) {
 $currentProxy = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
 if ($currentProxy.ProxyEnable -eq 1 -and $currentProxy.ProxyServer) {
  $proxyServer = $currentProxy.ProxyServer
  $httpAddress = $proxyServer
  $httpsAddress = $proxyServer
  if ($proxyServer -match '=') {
   $httpAddress = ''; $httpsAddress = ''
   foreach ($entry in $proxyServer.Split(';')) { if ($entry -match '^http=(.+)$') { $httpAddress = $Matches[1] }; if ($entry -match '^https=(.+)$') { $httpsAddress = $Matches[1] } }
   if (-not $httpAddress) { $httpAddress = $httpsAddress }; if (-not $httpsAddress) { $httpsAddress = $httpAddress }
  }
  if ($httpAddress -and $httpAddress -notmatch '^\w+://') { $httpAddress = 'http://' + $httpAddress }
  if ($httpsAddress -and $httpsAddress -notmatch '^\w+://') { $httpsAddress = 'http://' + $httpsAddress }
  if ($httpAddress) { $env:HTTP_PROXY = $httpAddress }
  if ($httpsAddress) { $env:HTTPS_PROXY = $httpsAddress }
 }
}
if (-not $env:NO_PROXY) { $env:NO_PROXY = 'localhost,127.0.0.1,::1' }