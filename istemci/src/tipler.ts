// Sunucudan gelen verinin biçimi. Sunucu yetkiye göre bazı alanları hiç göndermez; o alanlar isteğe bağlıdır.
export type Hak = 'kayit' | 'hassas' | 'evrak' | 'tahsilat' | 'kasa' | 'ders' | 'sinav' | 'rapor' | 'personel';
export type Rol = 'yonetici' | 'sube_muduru' | 'buro' | 'muhasebe' | 'egitmen';

export interface Sube { id: string; ad: string; adres: string; telefon: string; merkez: number; aktif: number }
export interface Personel { id: string; ad: string; rol: Rol; sube_id: string | null; aktif?: number; kullanici_adi?: string; telefon?: string; haklar?: Hak[] }
export interface Arac {
  id: string; sube_id: string; plaka: string; model: string; sinif: string; aktif: number;
  km?: number; muayene?: string; sigorta?: string; kasko?: string; bakim?: string; bakim_km?: number; notlar?: string;
}
export interface Taksit { vade: string; tutar: number; odenen: number; durum: 'odendi' | 'gecikti' | 'bekliyor'; ek?: string }
export interface Kalem { id: string; tur: string; aciklama: string; tutar: number; tarih: string; iptal: number }
export interface Hesap { ucret: number; paket: number; odenen: number; kalan: number; geciken: number; taksitler: Taksit[]; siradaki: Taksit | null; kalemler: Kalem[] }
export interface Ogrenci {
  id: string; sube_id: string; ad: string; soyad: string; telefon: string; sinif: string; mevcut_ehliyet: string; kayit_tarihi: string;
  durum: 'aktif' | 'dondu' | 'tamamlandi' | 'iptal'; egitmen_id: string | null; notlar: string; donem_id: string | null; eposta: string;
  portal_acik: boolean; dersler: { teorik: number; direksiyon: number }; tc: string; dogum?: string; adres?: string; hesap?: Hesap;
  evrak?: { eksik: string[]; tamam: string[] };
}
export interface Ders {
  id: string; ogrenci_id: string; sube_id: string; egitmen_id: string | null; arac_id: string | null; tur: 'teorik' | 'direksiyon';
  tarih: string; saat: string; sure_dk: number; durum: 'planli' | 'tamamlandi' | 'gelmedi' | 'iptal'; notu: string; kaydeden: string;
  tamamlanma: string | null; konum?: string | null;
}
export interface Sinav {
  id: string; ogrenci_id: string; sube_id: string; tur: 'e_sinav' | 'direksiyon'; tarih: string; saat: string; deneme: number;
  sonuc: 'bekliyor' | 'gecti' | 'kaldi' | 'girmedi'; puan: number | null; notu: string; yer: string; harc?: number;
}
export interface Odeme {
  id: string; ogrenci_id: string; sube_id: string; tutar: number; tarih: string; yontem: string; aciklama: string; kaydeden: string;
  iptal: number; iptal_nedeni: string; tur: 'odeme' | 'iade'; makbuz_no: string; olusturma: string;
}
export interface Gider { id: string; sube_id: string; tutar: number; tarih: string; kategori: string; aciklama: string; kaydeden: string; iptal: number; yontem: string; tedarikci_id: string | null; veresiye: number; arac_id: string | null }
export interface Tedarikci { id: string; ad: string; telefon: string; vergi_no: string; notlar: string; aktif: number; bakiye: number }
export interface TedarikciOdeme { id: string; tedarikci_id: string; sube_id: string; tutar: number; tarih: string; yontem: string; aciklama: string; kaydeden: string; iptal: number }
export interface GunSonu { id: string; sube_id: string; tarih: string; beklenen: number; sayilan: number; fark: number; aciklama: string; kaydeden: string }
export interface Olay { id: number; zaman: string; sube_id: string | null; kullanici: string; tur: string; metin: string }
export interface Gorevlendirme { id: string; kullanici_id: string; sube_id: string; bas: string; bit: string; aciklama: string }
export interface Donem { id: string; ad: string; bas: string; bit: string }
export interface TeorikGrup { id: string; sube_id: string; donem_id: string | null; ad: string; derslik: string; egitmen_id: string | null; aktif: number; uyeler: string[] }
export interface TeorikOturum { id: string; grup_id: string; sube_id: string; tarih: string; saat: string; ders_saati: number; konu: string; egitmen_id: string | null; durum: 'planli' | 'yapildi' | 'iptal' }
export interface Yoklama { oturum_id: string; ogrenci_id: string; durum: 'geldi' | 'gelmedi' | 'izinli' }
export interface Sinif { ad: string; teorik: number; direksiyon: number }
export interface Duyuru { id: string; sube_id: string | null; baslik: string; metin: string; bas: string; bit: string; hedef: string; kaydeden: string; olusturma: string }
export interface Evrak { id: string; ogrenci_id: string; tur: string; ad: string; boyut: number; tip: string; kaydeden: string; olusturma: string }
export interface PersonelBelge { id: string; kullanici_id: string; tur: string; no: string; bitis: string; notlar: string }
export interface Izin { id: string; kullanici_id: string; bas: string; bit: string; tur: string; aciklama: string }

export interface Ayarlar {
  siniflar: Record<string, Sinif>; sinavHakki: number; eSinavGecme: number; dersSuresi: number; konumKaydi: boolean;
  ogrenciDersSecimi: { acik: boolean; bas: string; bit: string; enErkenGun: number; enGecGun: number };
  prim: { direksiyon: number; teorik: number }; ucretler: { ekDers: number; sinavTekrar: number };
  kurum: { adres: string; telefon: string; vergiDairesi: string; vergiNo: string; logo: string };
  sozlesmeMetni: string; sms: { acik: boolean; saglayici: string; baslik: string };
  pos: { acik: boolean; saglayici: string; magazaNo: string; anahtar: string; gizli: string; deneme: boolean };
  evrakTurleri?: string[];
}

export interface Veri {
  ben: { id: string; ad: string; rol: Rol; sube_id: string | null; haklar: Hak[]; kullanici_adi: string; totp: boolean };
  kurum: { ad: string; adres: string; telefon: string; vergiDairesi: string; vergiNo: string; logo: string };
  bugun: string;
  tanimlar: {
    haklar: Record<Hak, string>; roller: Record<Rol, string>; siniflar: Record<string, Sinif>; sinavHakki: number; eSinavGecme: number;
    dersSuresi: number; konumKaydi: boolean; kalemTurleri: Record<string, string>; ucretler: { ekDers: number; sinavTekrar: number };
    teorikKonular: string[]; evrakTurleri?: string[]; smsAcik?: boolean; posAcik?: boolean;
  };
  ayarlar?: Ayarlar;
  subeler: Sube[]; personel: Personel[]; araclar: Arac[]; gorevlendirmeler: Gorevlendirme[]; olaylar?: Olay[];
  donemler: Donem[]; teorikGruplar: TeorikGrup[]; teorikOturumlar: TeorikOturum[]; yoklamalar: Yoklama[];
  ogrenciler: Ogrenci[]; dersler: Ders[]; sinavlar: Sinav[];
  odemeler?: Odeme[]; giderler?: Gider[]; tedarikciler?: Tedarikci[]; tedarikciOdemeleri?: TedarikciOdeme[]; gunSonlari?: GunSonu[];
  duyurular?: Duyuru[]; evraklar?: Evrak[]; personelBelgeleri?: PersonelBelge[]; izinler?: Izin[];
}

export interface OgrenciVeri {
  kurum: { ad: string; logo: string; telefon: string };
  bugun: string;
  ben: { ad: string; soyad: string; sinif: string; sinif_ad: string; durum: string; kayit_tarihi: string; sube: string; sube_telefon: string; sube_adres: string; egitmen: string; sifreDegismeli: boolean };
  gerekli: Sinif | null; sayac: { teorik: number; direksiyon: number }; sinavHakki: number; eSinavGecme: number;
  hesap: Hesap;
  dersler: { id: string; tur: string; tarih: string; saat: string; sure_dk: number; durum: string }[];
  dersSecimi: { acik: boolean; bas: string; bit: string; enErkenGun: number; enGecGun: number }; egitmenVar: boolean;
  sinavlar: { tur: string; tarih: string; saat: string; deneme: number; sonuc: string; puan: number | null; yer: string }[];
  teorikDersler: { tarih: string; saat: string; ders_saati: number; konu: string; durum: string; grup: string; derslik: string; yoklama: string | null }[];
  duyurular?: { id: string; baslik: string; metin: string; bas: string }[];
  evrak?: { eksik: string[]; tamam: string[] };
  pos?: { acik: boolean };
}
