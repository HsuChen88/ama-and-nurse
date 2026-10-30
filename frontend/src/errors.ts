const MESSAGES: Record<string, string> = {
  AUDIO_TOO_SHORT: '太短了，請再講一次 / Terlalu pendek, coba lagi',
  AUDIO_TOO_LONG: '錄音太久，請縮短再試 / Rekaman terlalu panjang, coba lebih singkat',
  ASR_EMPTY: '聽不清楚，請靠近手機再講一次 / Suara tidak terdengar, coba lebih dekat',
  INVALID_AUDIO: '錄音無法讀取，請再試一次 / Rekaman tidak dapat dibaca, coba lagi',
  INVALID_SPEAKER: '說話者資料錯誤，請重新整理 / Data pembicara salah, muat ulang',
  UPSTREAM_ERROR: '翻譯服務暫時忙碌，請稍後再試 / Layanan sedang sibuk, coba lagi nanti',
  NOT_FOUND: '語音已過期，請重新錄音 / Audio sudah kedaluwarsa, rekam lagi',
  MIC_DENIED: '請允許麥克風權限後再試 / Izinkan akses mikrofon lalu coba lagi',
  MIC_UNAVAILABLE: '無法使用麥克風，請檢查手機設定 / Mikrofon tidak tersedia, periksa pengaturan',
  INSECURE_CONTEXT: '請使用 HTTPS 安全網址開啟 / Buka melalui alamat HTTPS yang aman',
  NETWORK_ERROR: '網路連線失敗，請稍後再試 / Koneksi gagal, coba lagi nanti',
  AUDIO_PLAYBACK_ERROR: '語音無法播放，請稍後再試 / Audio tidak dapat diputar, coba lagi nanti',
  UNKNOWN_ERROR: '發生問題，請再試一次 / Terjadi masalah, coba lagi',
}

export function friendlyError(code: string): string {
  return MESSAGES[code] ?? MESSAGES.UNKNOWN_ERROR
}
