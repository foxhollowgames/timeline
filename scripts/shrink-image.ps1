# Re-save a picture as a JPEG that fits in -Width by -Height, on a white background.
# Used by scripts/fetch-images.mjs on Windows, which has System.Drawing built in.
param([string]$In, [string]$Out, [int]$Width = 440, [int]$Height = 330, [int]$Quality = 72)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile($In)
try {
  $scale = [Math]::Min([double]1, [Math]::Min([double]$Width / $source.Width, [double]$Height / $source.Height))
  $w = [int][Math]::Round($source.Width * $scale)
  $h = [int][Math]::Round($source.Height * $scale)
  $canvas = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.Clear([System.Drawing.Color]::White)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($source, 0, 0, $w, $h)
  $g.Dispose()
} finally { $source.Dispose() }
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)
$canvas.Save($Out, $codec, $params)
$canvas.Dispose()
Write-Output "$w $h"
