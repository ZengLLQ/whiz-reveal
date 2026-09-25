export type GuideLanguage = 'en' | 'zh' | 'id';
export type GuideSection = 'start' | 'display' | 'shortcuts' | 'session';

type GuideItem = { title: string; body: string; keys?: string[] };
type GuidePage = { label: string; title: string; description: string; items: GuideItem[]; note?: string };
type GuideContent = {
  language: string;
  htmlLang: string;
  title: string;
  subtitle: string;
  changeLanguage: string;
  close: string;
  navigation: string;
  footer: string;
  pages: Record<GuideSection, GuidePage>;
};

export const guideSections: GuideSection[] = ['start', 'display', 'shortcuts', 'session'];

export const manualContent: Record<GuideLanguage, GuideContent> = {
  en: {
    language: 'English', htmlLang: 'en', title: 'A little guidance.',
    subtitle: 'Everything you need for a smooth reveal.', changeLanguage: 'Change language',
    close: 'Close guide', navigation: 'Guide sections', footer: 'WhizReveal by JAYCEE 曾令强',
    pages: {
      start: {
        label: 'Get started', title: 'Set up. Draw. Reveal.',
        description: 'Your controller manages the session. The display presents the results to your audience.',
        items: [
          { title: '01 / Set your pool', body: 'Enter a whole number from 1 to 1,000,000 in Total samples. A value of 250 creates the pool 1–250. Once you have drawn, start a new session before changing the pool.' },
          { title: '02 / Choose how many', body: 'Number of draws means the number of winners in one draw, from 1 to 500. Click Apply settings after editing either number.' },
          { title: '03 / Choose your rule', body: 'Enable No duplicates to exclude every number already drawn in this session. When disabled, numbers can repeat, even within one draw. Turning it back on excludes all numbers in the session history.' },
          { title: '04 / Make the reveal', body: 'Click Draw. The numbers shuffle briefly, then settle into the results. Wait for the reveal to finish before drawing again. Results appear in Session history automatically.' },
        ],
        note: 'If too few numbers remain with No duplicates enabled, lower Number of draws and apply the change, or start a new session.',
      },
      display: {
        label: 'Presentation', title: 'Ready for your audience.',
        description: 'Use a second monitor or projector for the presentation window.',
        items: [
          { title: 'Open or close the display', body: 'Click Launch display to open the audience window. The same button becomes Close display; click it again to close that window. Closing the display keeps your draw history and session. Reopen it whenever you need it.' },
          { title: 'Choose the view', body: 'Current draw shows the latest result with centered rows. Full history shows all draws, grouped under 1st Draw, 2nd Draw, 3rd Draw, and so on. The audience window stays in sync with the controller.' },
          { title: 'Adjust the numbers', body: 'Display scale adjusts the number tiles from 50% to 200%. Numbers stay centered as rows wrap. Scroll vertically when the results are taller than the window.' },
          { title: 'Adjust your controls', body: 'Use A− and A+ beside UI text to change controller text size from 90% to 150%. Click the percentage to return to 100%. This setting is separate from Display scale.' },
        ],
        note: 'For a second screen, use Windows display settings to extend your desktop. In the display window, Esc leaves fullscreen so you can move the window; F11 toggles fullscreen.',
      },
      shortcuts: {
        label: 'Shortcuts', title: 'A few useful keys.',
        description: 'Shortcuts act on the window that currently has focus.',
        items: [
          { title: 'Start a draw', body: 'In the controller, press Enter when no input, button, or other control is focused. Apply pending settings first. Enter cannot start a new draw while a dialog is open; a reveal already in progress continues.', keys: ['Enter'] },
          { title: 'Leave fullscreen', body: 'In the audience display, press Esc to leave fullscreen. In this guide, Esc closes the guide.', keys: ['Esc'] },
          { title: 'Toggle fullscreen', body: 'In the audience display, press F11 to enter or leave fullscreen. You can also use its fullscreen button.', keys: ['F11'] },
          { title: 'Close the focused window', body: 'Use the standard Windows shortcut. Closing only the audience display does not clear the session.', keys: ['Alt', 'F4'] },
        ],
        note: 'Use Tab and Shift + Tab to move between controls, and Enter or Space to activate a focused button.',
      },
      session: {
        label: 'Your session', title: 'Keep the event moving.',
        description: 'Your results stay organized and are saved locally on this computer.',
        items: [
          { title: 'Read your history', body: 'Session history lists previous draws with their numbers and times. Switch Display view to Full history to show the grouped results to your audience.' },
          { title: 'Start fresh deliberately', body: 'Click New session, then confirm. This clears the current session history and makes every number available again. Presentation settings stay the same. Choose Keep session to cancel.' },
          { title: 'Pick up where you left off', body: 'The installed app saves your session on this device and restores it when you reopen the app. This is local storage, not synchronization between computers.' },
          { title: 'If a draw is unavailable', body: 'Apply any edited settings, wait for an active reveal to finish, and check that enough numbers remain. If a message appears, read it before retrying. Reopen the display if its window has been closed.' },
        ],
        note: 'Changing the number pool after a draw requires a new session. Save any results you need before confirming a reset.',
      },
    },
  },
  id: {
    language: 'Bahasa Indonesia', htmlLang: 'id', title: 'Panduan singkat.',
    subtitle: 'Semua yang Anda butuhkan untuk pengundian yang lancar.', changeLanguage: 'Ganti bahasa',
    close: 'Tutup panduan', navigation: 'Bagian panduan', footer: 'WhizReveal by JAYCEE 曾令强',
    pages: {
      start: {
        label: 'Mulai', title: 'Atur. Undi. Tampilkan.',
        description: 'Controller mengelola sesi. Jendela display menampilkan hasil kepada audiens.',
        items: [
          { title: '01 / Tentukan kumpulan nomor', body: 'Isi Total samples dengan bilangan bulat dari 1 hingga 1.000.000. Nilai 250 membuat kumpulan nomor 1–250. Setelah pengundian dilakukan, mulai sesi baru untuk mengubah kumpulan nomor.' },
          { title: '02 / Tentukan jumlah pemenang', body: 'Number of draws berarti jumlah pemenang dalam satu kali pengundian, dari 1 hingga 500. Klik Apply settings setelah mengubah salah satu angka.' },
          { title: '03 / Pilih aturan', body: 'Aktifkan No duplicates agar nomor yang sudah terundi dalam sesi ini tidak terpilih lagi. Saat dinonaktifkan, nomor dapat berulang, termasuk dalam satu pengundian. Jika diaktifkan kembali, seluruh nomor dalam riwayat sesi akan dikecualikan.' },
          { title: '04 / Mulai pengundian', body: 'Klik Draw. Nomor akan berganti cepat sesaat, lalu berhenti pada hasil akhir. Tunggu animasi selesai sebelum mengundi lagi. Hasil otomatis muncul di Session history.' },
        ],
        note: 'Jika sisa nomor tidak cukup saat No duplicates aktif, kurangi Number of draws dan terapkan pengaturannya, atau mulai sesi baru.',
      },
      display: {
        label: 'Presentasi', title: 'Siap untuk audiens.',
        description: 'Gunakan monitor kedua atau proyektor untuk jendela presentasi.',
        items: [
          { title: 'Buka atau tutup display', body: 'Klik Launch display untuk membuka jendela audiens. Tombol yang sama berubah menjadi Close display; klik kembali untuk menutup jendela tersebut. Riwayat dan sesi tetap tersimpan. Anda dapat membukanya lagi kapan saja.' },
          { title: 'Pilih tampilan', body: 'Current draw menampilkan hasil terbaru dengan baris nomor di tengah. Full history menampilkan seluruh pengundian dengan judul 1st Draw, 2nd Draw, 3rd Draw, dan seterusnya. Jendela audiens mengikuti pengaturan controller.' },
          { title: 'Atur ukuran nomor', body: 'Display scale mengatur ukuran kartu nomor dari 50% hingga 200%. Setiap baris tetap berada di tengah. Gulir ke bawah jika hasil melebihi tinggi jendela.' },
          { title: 'Atur ukuran teks', body: 'Gunakan A− dan A+ di sebelah UI text untuk mengubah ukuran teks controller dari 90% hingga 150%. Klik persentase untuk kembali ke 100%. Pengaturan ini terpisah dari Display scale.' },
        ],
        note: 'Untuk layar kedua, pilih mode Extend pada pengaturan layar Windows. Di jendela display, Esc keluar dari layar penuh agar jendela dapat dipindahkan; F11 mengaktifkan atau menonaktifkan layar penuh.',
      },
      shortcuts: {
        label: 'Pintasan', title: 'Tombol yang berguna.',
        description: 'Pintasan berlaku pada jendela yang sedang aktif.',
        items: [
          { title: 'Mulai pengundian', body: 'Di controller, tekan Enter saat tidak ada kolom input, tombol, atau kontrol lain yang sedang dipilih. Terapkan perubahan pengaturan terlebih dahulu. Enter tidak memulai pengundian baru saat dialog terbuka; animasi pengundian yang sudah berjalan tetap berlanjut.', keys: ['Enter'] },
          { title: 'Keluar dari layar penuh', body: 'Di jendela audiens, tekan Esc untuk keluar dari layar penuh. Di panduan ini, Esc menutup panduan.', keys: ['Esc'] },
          { title: 'Ubah mode layar penuh', body: 'Di jendela audiens, tekan F11 untuk masuk atau keluar dari layar penuh. Anda juga dapat menggunakan tombol layar penuh.', keys: ['F11'] },
          { title: 'Tutup jendela aktif', body: 'Gunakan pintasan standar Windows ini. Menutup jendela audiens saja tidak menghapus sesi.', keys: ['Alt', 'F4'] },
        ],
        note: 'Gunakan Tab dan Shift + Tab untuk berpindah antarkontrol, lalu Enter atau Space untuk mengaktifkan tombol yang dipilih.',
      },
      session: {
        label: 'Sesi Anda', title: 'Jaga kelancaran acara.',
        description: 'Hasil tersusun rapi dan disimpan secara lokal di komputer ini.',
        items: [
          { title: 'Lihat riwayat', body: 'Session history mencatat nomor dan waktu pengundian sebelumnya. Ubah Display view menjadi Full history untuk menampilkan hasil yang dikelompokkan kepada audiens.' },
          { title: 'Mulai sesi baru', body: 'Klik New session, lalu konfirmasi. Tindakan ini menghapus riwayat sesi saat ini dan membuat semua nomor tersedia kembali. Pengaturan presentasi tetap sama. Pilih Keep session untuk membatalkan.' },
          { title: 'Lanjutkan sesi terakhir', body: 'Aplikasi yang terpasang menyimpan sesi di perangkat ini dan memulihkannya saat dibuka kembali. Penyimpanan ini bersifat lokal dan tidak menyinkronkan sesi antarkomputer.' },
          { title: 'Jika belum bisa mengundi', body: 'Terapkan perubahan pengaturan, tunggu animasi yang aktif selesai, dan periksa apakah nomor yang tersisa mencukupi. Jika muncul pesan, baca dahulu sebelum mencoba lagi. Buka kembali display jika jendelanya sudah ditutup.' },
        ],
        note: 'Mengubah kumpulan nomor setelah pengundian memerlukan sesi baru. Simpan hasil yang masih diperlukan sebelum mengonfirmasi penghapusan sesi.',
      },
    },
  },
  zh: {
    language: '简体中文', htmlLang: 'zh-Hans', title: '使用指南。',
    subtitle: '轻松设置，让每次揭晓顺利进行。', changeLanguage: '切换语言',
    close: '关闭指南', navigation: '指南章节', footer: 'WhizReveal by JAYCEE 曾令强',
    pages: {
      start: {
        label: '开始使用', title: '设置、抽取、揭晓。',
        description: '控制窗口用于管理抽奖，展示窗口用于向观众呈现结果。',
        items: [
          { title: '01 / 设置号码范围', body: '在 Total samples 中输入 1 至 1,000,000 的整数。例如，输入 250 即生成 1–250 的号码池。开始抽奖后，需要新建一轮会话才能更改号码范围。' },
          { title: '02 / 设置中奖人数', body: 'Number of draws 表示每次抽取的中奖号码数量，可设置为 1 至 500。修改任一数值后，点击 Apply settings 应用设置。' },
          { title: '03 / 选择抽奖规则', body: '开启 No duplicates 后，本轮会话中已抽取的号码不会再次中奖。关闭后允许号码重复，包括同一次抽奖内重复。重新开启时，会排除当前会话全部历史记录中的号码。' },
          { title: '04 / 开始抽奖', body: '点击 Draw。号码会快速变化片刻，再停留在最终结果。请等待揭晓完成后再进行下一次抽奖。结果会自动显示在 Session history 中。' },
        ],
        note: '开启 No duplicates 时，如果剩余号码不足，请减少 Number of draws 并应用设置，或新建会话。',
      },
      display: {
        label: '展示设置', title: '为观众准备就绪。',
        description: '可使用第二台显示器或投影仪展示抽奖结果。',
        items: [
          { title: '打开或关闭展示窗口', body: '点击 Launch display 打开展示窗口。该按钮随后变为 Close display，再次点击即可关闭窗口。关闭展示窗口不会清除抽奖历史或当前会话，您可以随时重新打开。' },
          { title: '选择展示内容', body: 'Current draw 显示最新抽奖结果，号码各行居中排列。Full history 按 1st Draw、2nd Draw、3rd Draw 等标题分组显示所有抽奖结果。展示窗口会实时同步控制窗口的设置。' },
          { title: '调整号码大小', body: 'Display scale 可将号码卡片缩放至 50%–200%。换行后仍保持居中排列。内容超过窗口高度时，可以向下滚动查看。' },
          { title: '调整控制界面文字', body: '使用 UI text 旁的 A− 和 A+，将控制窗口文字大小调整至 90%–150%。点击百分比可恢复为 100%。此设置与 Display scale 相互独立。' },
        ],
        note: '使用第二台显示器时，请在 Windows 显示设置中选择“扩展”。在展示窗口中，按 Esc 退出全屏后可移动窗口；按 F11 可切换全屏模式。',
      },
      shortcuts: {
        label: '快捷键', title: '几个实用按键。',
        description: '快捷键作用于当前获得焦点的窗口。',
        items: [
          { title: '开始抽奖', body: '在控制窗口中，当输入框、按钮及其他控件均未获得焦点时，按 Enter 开始抽奖。请先应用待保存的设置。打开对话框时，Enter 不会触发新的抽奖；已开始的揭晓会继续进行。', keys: ['Enter'] },
          { title: '退出全屏', body: '在展示窗口中，按 Esc 退出全屏。在本指南中，按 Esc 可关闭指南。', keys: ['Esc'] },
          { title: '切换全屏', body: '在展示窗口中，按 F11 进入或退出全屏，也可点击窗口中的全屏按钮。', keys: ['F11'] },
          { title: '关闭当前窗口', body: '使用此 Windows 标准快捷键可关闭当前窗口。仅关闭展示窗口不会清除会话。', keys: ['Alt', 'F4'] },
        ],
        note: '使用 Tab 和 Shift + Tab 在控件间切换，按 Enter 或空格键激活当前按钮。',
      },
      session: {
        label: '会话与历史', title: '让活动有序进行。',
        description: '抽奖结果按组整理，并保存在本机。',
        items: [
          { title: '查看历史记录', body: 'Session history 显示之前的中奖号码与抽奖时间。将 Display view 切换为 Full history，可向观众展示分组结果。' },
          { title: '新建会话', body: '点击 New session 并确认，将清除当前会话的抽奖历史，让全部号码重新可用。展示设置保持不变。如需取消，请选择 Keep session。' },
          { title: '继续上次的会话', body: '已安装的应用会将会话保存在当前设备上，并在重新打开时恢复。这是本地保存，不会在不同电脑之间同步。' },
          { title: '暂时无法抽奖时', body: '请先应用已修改的设置，等待当前揭晓结束，并检查剩余号码是否足够。如有提示信息，请阅读后再试。如果展示窗口已关闭，可再次打开。' },
        ],
        note: '抽奖后更改号码范围需要新建会话。确认清除会话前，请自行保存仍需保留的结果。',
      },
    },
  },
};

// Sound is local to the controller; the audience window never doubles the audio.
manualContent.en.pages.display.items.push({ title: 'Draw sounds', body: 'Sound on plays a soft click, rising shuffle ticks, and a reveal chime. Click Sound on to mute immediately; Sound off enables audio again. Your choice is saved on this device. Audio uses the controller computer’s selected system output. Restoring past results is silent.' });
manualContent.id.pages.display.items.push({ title: 'Suara pengundian', body: 'Sound on memutar klik lembut, ketukan saat nomor diacak, dan nada saat hasil muncul. Klik Sound on untuk langsung membisukan; Sound off mengaktifkan suara kembali. Pilihan disimpan di perangkat ini. Suara memakai keluaran audio sistem komputer controller. Membuka hasil lama tidak memutar suara.' });
manualContent.zh.pages.display.items.push({ title: '抽奖音效', body: 'Sound on 会播放轻柔的点击音、抽奖中的节奏音和结果揭晓提示音。点击 Sound on 可立即静音；点击 Sound off 可重新开启。设置保存在本机。声音使用控制端电脑的系统音频输出，恢复历史结果时不播放音效。' });
manualContent.en.pages.shortcuts.items.push({ title: 'macOS window controls', body: 'On Mac, use Command + W to close the focused window, or Command + Q to quit. If F11 controls a system function, use the display’s fullscreen button instead.' });
manualContent.id.pages.shortcuts.items.push({ title: 'Kontrol jendela macOS', body: 'Di Mac, gunakan Command + W untuk menutup jendela aktif atau Command + Q untuk keluar. Jika F11 menjalankan fungsi sistem, gunakan tombol fullscreen pada display.' });
manualContent.zh.pages.shortcuts.items.push({ title: 'macOS 窗口操作', body: '在 Mac 上，Command + W 关闭当前窗口，Command + Q 退出应用。如果 F11 被系统占用，请使用展示窗口的全屏按钮。' });
manualContent.en.pages.start.items.push({ title: 'Draw duration', body: 'Choose how long numbers shuffle: 1, 1.6, 3, 5, 10, 15, 20 or 30 seconds. The choice saves automatically for the next draw. Apply edited number settings first. Animation and sounds follow the selected duration.' });
manualContent.id.pages.start.items.push({ title: 'Durasi pengundian', body: 'Pilih lama pengacakan melalui Draw duration: 1, 1,6, 3, 5, 10, 15, 20 atau 30 detik. Pilihan otomatis disimpan untuk pengundian berikutnya. Terapkan perubahan jumlah nomor terlebih dahulu. Animasi dan suara mengikuti durasi pilihan.' });
manualContent.zh.pages.start.items.push({ title: '抽奖时长', body: '通过 Draw duration 选择 1、1.6、3、5、10、15、20 或 30 秒。设置自动保存并用于下一次抽奖。请先应用号码设置的修改。动画和音效遵循所选时长。' });
