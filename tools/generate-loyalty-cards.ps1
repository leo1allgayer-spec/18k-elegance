Add-Type -AssemblyName System.Drawing
$assetDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets'))
for ($progress = 1; $progress -le 10; $progress++) {
  $bitmap = New-Object Drawing.Bitmap 1000,1200
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $navy = [Drawing.ColorTranslator]::FromHtml('#03112b')
  $gold = [Drawing.ColorTranslator]::FromHtml('#d1b77f')
  $brush = New-Object Drawing.SolidBrush $gold
  $whiteBrush = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#fcfaf4'))
  $pen = New-Object Drawing.Pen $gold,2
  $graphics.Clear($navy)
  $graphics.DrawRectangle($pen,35,35,930,1130)
  $serif = New-Object Drawing.Font 'Georgia',54
  $title = New-Object Drawing.Font 'Georgia',38
  $sans = New-Object Drawing.Font 'Arial',24
  $small = New-Object Drawing.Font 'Arial',18
  $center = New-Object Drawing.StringFormat
  $center.Alignment = [Drawing.StringAlignment]::Center
  $graphics.DrawString('ELEGANCE',$serif,$brush,(New-Object Drawing.RectangleF 50,95,900,90),$center)
  $graphics.DrawString('18K',$sans,$brush,(New-Object Drawing.RectangleF 50,190,900,45),$center)
  $graphics.DrawString('Seu cartão fidelidade',$title,$whiteBrush,(New-Object Drawing.RectangleF 50,315,900,80),$center)
  $graphics.DrawString('Cada compra deixa uma marca.',$sans,$whiteBrush,(New-Object Drawing.RectangleF 50,405,900,50),$center)
  for ($slot = 1; $slot -le 10; $slot++) {
    $x = 100 + (($slot-1)%5)*170
    $y = 530 + [Math]::Floor(($slot-1)/5)*150
    if ($slot -le $progress) { $graphics.FillEllipse($brush,$x,$y,120,120) }
    $graphics.DrawEllipse($pen,$x,$y,120,120)
    $markBrush = if ($slot -le $progress) { New-Object Drawing.SolidBrush $navy } else { New-Object Drawing.SolidBrush $gold }
    $graphics.DrawString('E',$title,$markBrush,(New-Object Drawing.RectangleF $x,($y+25),120,70),$center)
    $markBrush.Dispose()
  }
  $graphics.DrawString("$progress de 10 compras",$title,$brush,(New-Object Drawing.RectangleF 50,870,900,75),$center)
  $message = if ($progress -eq 10) { 'Cartão completo! Você ganhou 15% OFF.' } else { 'Complete 10 compras e ganhe 15% OFF.' }
  $graphics.DrawString($message,$sans,$whiteBrush,(New-Object Drawing.RectangleF 50,990,900,60),$center)
  $graphics.DrawString('Confira as regras e benefícios na sua conta.',$small,$brush,(New-Object Drawing.RectangleF 50,1085,900,40),$center)
  $bitmap.Save((Join-Path $assetDirectory "loyalty-card-$progress.png"),[Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose();$bitmap.Dispose();$brush.Dispose();$whiteBrush.Dispose();$pen.Dispose();$serif.Dispose();$title.Dispose();$sans.Dispose();$small.Dispose();$center.Dispose()
}
