<p align="center">
  <img src="docs/assets/banner.svg" alt="Pinger v2.0 Banner" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/s%C3%BCr%C3%BCm-2.0.0-2f81f7?style=for-the-badge" alt="Sürüm 2.0.0" />
  <img src="https://img.shields.io/badge/manifest-MV3-3ecf8e?style=for-the-badge" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/taray%C4%B1c%C4%B1lar-Chrome%20%7C%20Edge%20%7C%20Brave%20%7C%20Firefox-58a6ff?style=for-the-badge" alt="Desteklenen Tarayıcılar" />
  <img src="https://img.shields.io/badge/platform-Windows%20Native%20Host-0078d4?style=for-the-badge" alt="Windows Native Host" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/lisans-MIT-8b9bb0?style=for-the-badge" alt="MIT Lisansı" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>Türkçe</strong>
</p>

---

**Pinger**, Windows Native Messaging Host (Node.js + otomatik PowerShell yedeği) ile çalışan hafif bir Manifest V3 tarayıcı eklentisidir. Herhangi bir web sayfasında bir IP adresini veya host adını seçip sağ tıklayarak tarayıcıdan çıkmadan canlı **ICMP Ping**, **Tracert**, **TCP Port Taraması** ve **DNS / Reverse PTR Sorgusu** çalıştırabilirsiniz.

## Görsel Önizleme

<table>
  <tr>
    <td align="center" width="43%">
      <strong>Popup Konsol ve Canlı Gecikme Grafiği</strong><br /><br />
      <img src="docs/assets/preview-popup.svg" alt="Pinger v2.0 Popup Önizlemesi" width="100%" />
    </td>
    <td align="center" width="57%">
      <strong>Sayfa İçi Sürüklenebilir Panel ve Bildirimler</strong><br /><br />
      <img src="docs/assets/preview-sidepanel.svg" alt="Pinger v2.0 Yan Panel Önizlemesi" width="100%" />
    </td>
  </tr>
</table>

## Özellikler

| Özellik | Açıklama |
| :--- | :--- |
| **ICMP Ping (`-t` / `4` / `10`)** | `.NET NetworkInformation.Ping` ile kesintisiz canlı paket akışı (`ping.exe` pipe buffer takılmasını aşar). |
| **Canlı Gecikme Grafiği & İstatistik** | Son 30 paketin renk kodlu RTT grafiği (`<50ms`, `50–150ms`, `>150ms`, `Timeout`) ile `Gönderilen / Kayıp %`, `Anlık`, `Ortalama` ve `Min / Maks`. |
| **Tracert (maks. 30 hop)** | Adım adım rota takibi ve engel oluşturmayan hızlı ters DNS çözümlemesi. |
| **TCP Port Tarayıcı** | Belirtilen port listesini (ör. `80,443,22,3389,8080`) 2000 ms timeout ile test edip `OPEN (ms)` / `CLOSED` gösterir. |
| **DNS & Reverse PTR Lookup** | Domainler için `A` (IPv4), `AAAA` (IPv6) ve IP adresleri için Reverse PTR kayıtlarını listeler. |
| **Kesinti & Kurtarma Bildirimleri** | Ardışık **3+ timeout** sonrası kesinti uyarısı ve hedef **tekrar yanıt verince** Windows + tarayıcı bildirimi gönderir. |
| **Sayfa İçi Shadow DOM Paneli** | IP seçince hızlı butonlar veya sağ tık menüsü açılır (`Shift + Sağ Tık` ile tarayıcının normal menüsü korunur). |
| **Son Hedefler & Özet Kopyalama** | Son 8 hedef için hızlı çipler, isteğe bağlı saat damgası ve istatistik + log kopyalama butonu. |

## Mimari

```mermaid
flowchart LR
    A["Web Sayfası Seçimi / Sağ Tık"] -->|content.js Shadow DOM| B["Background Worker (background.js)"]
    P["Araç Çubuğu Popup (action.html / popup.js)"] --> B
    B -->|chrome.runtime.connectNative| C["host.bat"]
    C -->|Node.js kuruluysa| D["host.js (Node.js)"]
    C -->|Node.js yoksa| E["host.ps1 (PowerShell Yedeği)"]
    D --> F[".NET Ping / TcpClient / Dns"]
    E --> F
    F -->|4-byte length-prefixed JSON| B
    B -->|3+ timeout / kurtarma| G["Windows Toast & Tarayıcı Bildirimi"]
```

## Kurulum (30 Saniyede)

### 1. Adım — İndir ve Kur
Aşağıdaki iki yöntemden birini seçin *(hiçbir ID kopyalamanız gerekmez)*:

- **A) PowerShell ile Tek Komut (En Hızlı):** Windows'ta PowerShell'i açıp şu komutu yapıştırın ve `Enter`'a basın:
  ```powershell
  irm https://raw.githubusercontent.com/CanOruckahya/Pinger-Browser-extension/main/scripts/easy-install.ps1 | iex
  ```
- **B) ZIP İndirerek:** [Releases](https://github.com/CanOruckahya/Pinger-Browser-extension/releases) sayfasından **`Pinger-v2.0.0-EasyInstall.zip`** dosyasını indirip klasöre çıkarın ve **`EasyInstall.bat`** dosyasına çift tıklayın.

### 2. Adım — Tarayıcıya Ekle (Chrome / Edge / Brave)
1. Adres çubuğuna `chrome://extensions` *(veya `edge://extensions`)* yazıp açın.
2. Sağ üstten **Geliştirici modu**nu açın.
3. **Paketlenmemiş öğe yükle** butonuna tıklayın → açılan pencerede **`Ctrl + V`** yapıp **Klasör Seç**'e basın *(klasör yolu 1. adımda otomatik kopyalandı)*.

### 3. Adım — Kullan
Açık web sayfanızı `F5` ile yenileyin. Herhangi bir IP'yi seçin veya sağ tıklayıp **Pingle**, **Tracert**, **Port Tara** ya da **DNS Lookup** deyin!

<details>
<summary>Firefox Kurulumu &amp; Kaldırma</summary>

1. Firefox'ta `about:debugging#/runtime/this-firefox` adresini açın.
2. **Geçici eklenti yükle** → [`Pinger/extension/manifest.json`](Pinger/extension/manifest.json) dosyasını seçin.
3. Eklentiyi tamamen kaldırmak için [`Pinger/uninstall.bat`](Pinger/uninstall.bat) dosyasını çalıştırın.
4. Node.js kurulu olması şart değildir; PC'de Node.js yoksa otomatik olarak PowerShell (`host.ps1`) kullanılır.

</details>

## Sorun Giderme

| Durum | Çözüm |
| :--- | :--- |
| `Native host bağlantısı koptu` | [`Pinger/EasyInstall.bat`](Pinger/EasyInstall.bat) dosyasını tekrar çalıştırın, eklentiyi yenileyip sayfada `F5` yapın. |
| Klasör taşındığı için host bulunamıyor | [`Pinger/EasyInstall.bat`](Pinger/EasyInstall.bat) dosyasını yeni klasörden tekrar çalıştırın. |
| IP üzerinde tarayıcının normal sağ tık menüsü lazım | **`Shift` + Sağ Tık** yaptığınızda Pinger menüsü atlanır ve tarayıcı menüsü açılır. |

## Lisans

**Can Oruckahya** — [MIT Lisansı](LICENSE)
