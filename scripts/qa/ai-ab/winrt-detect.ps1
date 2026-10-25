# 윈도 내장 엔진으로 얼굴 상자(Windows.Media.FaceAnalysis)와 글자(Windows.Media.Ocr)를 찾는다 — 설치 · 내려받기 없음.
#   powershell -File winrt-detect.ps1 <이미지1> [<이미지2> ...]  → 이미지마다 JSON 한 줄
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Paths)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8   # 한글 글자 인식 결과가 깨지지 않게
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.FaceAnalysis.FaceDetector, Windows.Media, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $task = $asTaskGeneric.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait() | Out-Null; $task.Result }
$fd = Await ([Windows.Media.FaceAnalysis.FaceDetector]::CreateAsync()) ([Windows.Media.FaceAnalysis.FaceDetector])
$ocr = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
foreach ($p in $Paths) {
  try {
  $full = (Resolve-Path $p).Path
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($full)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $gray = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert($bmp, [Windows.Graphics.Imaging.BitmapPixelFormat]::Gray8)
  $faces = Await ($fd.DetectFacesAsync($gray)) ([System.Collections.Generic.IList[Windows.Media.FaceAnalysis.DetectedFace]])
  $fb = New-Object System.Collections.ArrayList; foreach ($f in $faces) { [void]$fb.Add(@([int]$f.FaceBox.X, [int]$f.FaceBox.Y, [int]$f.FaceBox.Width, [int]$f.FaceBox.Height)) }
  $ocrBmp = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert($bmp, [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)
  $res = Await ($ocr.RecognizeAsync($ocrBmp)) ([Windows.Media.Ocr.OcrResult])
  $lines = New-Object System.Collections.ArrayList; foreach ($ln in $res.Lines) { $x0 = 1e9; $y0 = 1e9; $x1 = 0; $y1 = 0; foreach ($wd in $ln.Words) { $b = $wd.BoundingRect; if ($b.X -lt $x0) { $x0 = $b.X }; if ($b.Y -lt $y0) { $y0 = $b.Y }; if ($b.X + $b.Width -gt $x1) { $x1 = $b.X + $b.Width }; if ($b.Y + $b.Height -gt $y1) { $y1 = $b.Y + $b.Height } }; [void]$lines.Add(@{ text = $ln.Text; box = @([int]$x0, [int]$y0, [int]($x1 - $x0), [int]($y1 - $y0)) }) }
  $stream.Dispose()
  [pscustomobject]@{ file = $full; w = $bmp.PixelWidth; h = $bmp.PixelHeight; faces = @($fb); text = @($lines); ocrLang = $ocr.RecognizerLanguage.LanguageTag } | ConvertTo-Json -Compress -Depth 6
  } catch {
    # 손상된 파일 하나가 나머지 검사를 멈추지 않게 — 그 파일만 오류로 남긴다
    [pscustomobject]@{ file = $p; error = $_.Exception.Message } | ConvertTo-Json -Compress
  }
}
