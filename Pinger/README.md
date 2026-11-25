# Pinger v2.0

Tarayıcıdan ayrılmadan canlı **Ping**, **Tracert**, **TCP Port Taraması** ve **DNS Lookup** yapan Manifest V3 eklentisi. Detaylı mimari ve görseller için kök dizindeki [README_TR.md](../README_TR.md) dosyasına bakabilirsiniz.

## En Kolay Kurulum (Soru Sormayan — Sabit ID)

1. **`EasyInstall.bat`** dosyasına çift tıklayın (sabit Extension ID `gfepdmddjmpndndaacmopoppcpkcdfjb` ile Chrome/Edge/Brave/Firefox kayıtlarını otomatik yapar ve `extension` klasör yolunu panoya kopyalar).
2. Tarayıcınızda `chrome://extensions` veya `edge://extensions` açın → **Geliştirici modu** → **Paketlenmemiş öğe yükle** → `Ctrl+V` → Klasör Seç!
   *(Tek satır PowerShell ile kurmak için: `irm https://raw.githubusercontent.com/CanOruckahya/Pinger-Browser-extension/main/scripts/easy-install.ps1 | iex`)*

## Manuel Kurulum (İsteğe Bağlı)

**Chrome / Edge / Brave**
1. `chrome://extensions`, `edge://extensions` veya `brave://extensions` açın
2. Geliştirici modu → **Paketlenmemiş öğe yükle** → `extension` klasörünü seçin
3. **ID**’yi kopyalayın

**Firefox**
1. `about:debugging#/runtime/this-firefox`
2. **Geçici eklenti yükle** → `extension\manifest.json` (ID hazır: `pinger@local`)

## 2) `install.bat` Çalıştır

1. `install.bat` dosyasına çift tıklayıp Extension ID’yi yapıştırın (veya `install.bat <CHROME_EDGE_ID>`)
2. Kaldırmak istediğinizde `uninstall.bat` dosyasını çalıştırabilirsiniz.

## 3) Kullan

- Eklentiyi **Yeniden yükle** → sayfayı **F5** → IP/host seç veya sağ tık → **Pingle / Tracert / Port Tara / DNS Lookup**
- IP üzerinde normal tarayıcı sağ tık menüsünü açmak için **`Shift` + Sağ Tık** kullanabilirsiniz.

---

**Node.js şart değil.** PC’de varsa `host.js`, yoksa otomatik olarak PowerShell (`host.ps1`) çalışır.  
**Bildirimler:** Ping’de ardışık 3+ timeout olunca kesinti bildirimi, hedef tekrar cevap verince Windows + tarayıcı kurtarma bildirimi düşer.
