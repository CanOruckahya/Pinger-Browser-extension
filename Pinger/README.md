# Pinger v2.0 — 3 Adımda Kurulum

Tarayıcıdan ayrılmadan canlı **Ping**, **Tracert**, **TCP Port Taraması** ve **DNS Lookup** yapan Manifest V3 eklentisi. Detaylar ve önizlemeler için [README_TR.md](../README_TR.md) dosyasına bakabilirsiniz.

## 1. Adım — Kurulumu Çalıştır
- Klasördeki **`EasyInstall.bat`** dosyasına çift tıklayın *(hiçbir ID sormaz, klasör yolunu otomatik panoya kopyalar)*.

## 2. Adım — Tarayıcıya Ekle (Chrome / Edge / Brave)
1. Adres çubuğuna `chrome://extensions` *(veya `edge://extensions`)* yazıp açın.
2. Sağ üstten **Geliştirici modu**nu açın.
3. **Paketlenmemiş öğe yükle** → açılan pencerede **`Ctrl + V`** → **Klasör Seç**.

## 3. Adım — Kullan
Açık web sayfanızı `F5` ile yenileyin, herhangi bir IP'yi seçip veya sağ tıklayıp **Pingle / Tracert / Port Tara / DNS Lookup** deyin!

---

* **Firefox:** `about:debugging#/runtime/this-firefox` → **Geçici eklenti yükle** → `extension\manifest.json`
* **Kaldırma:** `uninstall.bat` dosyasına çift tıklayın.
* **Not:** Node.js şart değildir (varsa `host.js`, yoksa PowerShell `host.ps1` çalışır). IP üzerinde normal tarayıcı sağ tık menüsü için **`Shift` + Sağ Tık** yapabilirsiniz.
