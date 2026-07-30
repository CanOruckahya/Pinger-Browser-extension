# Pinger

Başka bilgisayara klasörü kopyala, sırayla:

## 1) Extension’ı yükle

**Chrome / Edge**
1. `chrome://extensions` veya `edge://extensions`
2. Geliştirici modu → **Paketlenmemiş öğe yükle** → `extension` klasörü
3. **ID**’yi kopyala

**Firefox**
1. `about:debugging#/runtime/this-firefox`
2. **Geçici eklenti yükle** → `extension\manifest.json`  
   (ID hazır: `pinger@local`)

## 2) `install.bat` çalıştır

1. `install.bat` çift tıkla (ID sorarsa yapıştır)
   - veya daha garantisi: `cmd` aç → Pinger klasörüne gir → şu komutu çalıştır:
     `install.bat <CHROME_EDGE_ID>`

## 3) Kullan

Eklentiyi **Yeniden yükle** → sayfayı **F5** → IP seç / sağ tık → **Pingle**

---

**Node.js şart değil.** Klasörde yok; PC’de varsa host onu kullanır, yoksa PowerShell ile çalışır.  
ID değişirse sadece `install.bat`’ı tekrar çalıştır.

**Bildirim:** Ping’de 3 kez timeout sonrası IP tekrar cevap verirse Windows bildirimi düşer.
