# Imágenes para las tiendas

Generadas con `scripts/store-screenshots.py` a partir de capturas reales de la app (iPhone 18 Pro Max y Android 448 dp), con barra de estado limpia (9:41, batería llena).

## App Store (`app-store/`)
- 7 capturas de **1320 × 2868 px** (iPhone 6,9"). Es el único tamaño obligatorio; App Store Connect lo adapta a los iPhone más pequeños.
- PNG RGB sin transparencia. Súbelas en este orden (01 → 07).

## App Store, tamaño actual (`app-store-6.3/`)
- Las mismas 7 capturas en **1206 × 2622 px**, el tamaño que App Store Connect pide ahora en la pestaña «iPhone with Dynamic Island (medium display)».

## Google Play (`google-play/`)
- 7 capturas de teléfono de **1080 × 1920 px** (9:16). Cumplen el mínimo para destacar la app (1080 px y al menos 4 capturas).
- `feature-graphic.png`: **1024 × 500 px**. Imagen destacada, obligatoria.
- `icon-512.png`: **512 × 512 px**. Icono de la ficha, obligatorio.

## Volver a generarlas
1. Saca las capturas en bruto (`s1-inicio.png` … `s7-unete.png`) en una carpeta para iOS y otra para Android.
2. `python3 scripts/store-screenshots.py <carpeta-ios> <carpeta-android>`
Los titulares están en la lista `SCREENS` del script.
