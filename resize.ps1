Add-Type -AssemblyName System.Drawing

$src = 'C:\dev\Hinov Devis\app\public\logoh.png'
$img = [System.Drawing.Image]::FromFile($src)

foreach ($size in @(192, 512)) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    
    $scale = [math]::Min($size / $img.Width, $size / $img.Height) * 0.8
    $w = $img.Width * $scale
    $h = $img.Height * $scale
    $x = ($size - $w) / 2
    $y = ($size - $h) / 2
    
    $g.DrawImage($img, $x, $y, $w, $h)
    
    $dest = "C:\dev\Hinov Devis\app\public\pwa-$sizex$size.png"
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}
$img.Dispose()
