export const CANONICAL_ORIGIN = 'https://ndtstudio.com.vn'

export const LEGACY_REDIRECTS = [
  ['/og', '/share_home_v3.jpg'],
  ['/share_home_v2.jpg', '/share_home_v3.jpg'],
  ['/&', '/'],
  ['/%26', '/'],
  ['/thu-vien/collection', '/thu-vien/danh-muc/collection'],
  ['/thu-vien/nu', '/thu-vien/danh-muc/nu'],
  ['/thu-vien/nu/beauty', '/thu-vien/danh-muc/beauty'],
  ['/thu-vien/nu/cong-chua', '/thu-vien/danh-muc/cong-chua'],
  ['/thu-vien/nu/cong-chua-nang-tho', '/thu-vien/danh-muc/cong-chua'],
  ['/thu-vien/nu/birthday', '/thu-vien/danh-muc/birthday'],
  ['/thu-vien/nu/thoi-trang', '/thu-vien/danh-muc/thoi-trang'],
  ['/thu-vien/nu/tet-trung-thu', '/thu-vien/danh-muc/tet-trung-thu'],
  ['/thu-vien/nu/noel-mua-dong', '/thu-vien/danh-muc/noel-mua-dong'],
  ['/thu-vien/nu/cosplay', '/thu-vien/danh-muc/cosplay'],
  ['/thu-vien/nu/quyen-ru', '/thu-vien/danh-muc/quyen-ru'],
  ['/thu-vien/quyen-ru-sexy', '/thu-vien/danh-muc/quyen-ru'],
  ['/thu-vien/nam', '/thu-vien/danh-muc/nam'],
  ['/thu-vien/standard', '/thu-vien/danh-muc/standard'],
  ['/thu-vien/bts', '/thu-vien/danh-muc/bts'],
  ['/thu-vien/couple', '/thu-vien/danh-muc/couple'],
  ['/thu-vien/gia-dinh', '/thu-vien/danh-muc/gia-dinh'],
  ['/thu-vien/wedding', '/thu-vien/danh-muc/wedding'],
  ['/thu-vien/me-bau', '/thu-vien/danh-muc/me-bau'],
  ['/thu-vien/doi-nhom', '/thu-vien/danh-muc/doi-nhom'],
  ['/thu-vien/quang-cao', '/thu-vien/danh-muc/quang-cao'],
  ['/thu-vien/san-pham', '/thu-vien/danh-muc/san-pham'],
  ['/showroom', '/lien-he'],
  ['/dieu-khoan-dich-vu', '/gioi-thieu/chinh-sach'],
  ['/chinh-sach-bao-hanh', '/gioi-thieu/chinh-sach'],
  ['/gioi-thieu/thu-vien', '/thu-vien']
]

const wwwHosts = ['www.ndtstudio.com.vn', 'www.ndtstudio.site']

export function createSeoRedirects() {
  const wwwRedirects = wwwHosts.flatMap(host => {
    const has = [{ type: 'host', value: host }]
    return [
      ...LEGACY_REDIRECTS.map(([source, destination]) => ({
        source,
        destination: `${CANONICAL_ORIGIN}${destination}`,
        has,
        statusCode: 301
      })),
      {
        source: '/:path*',
        destination: `${CANONICAL_ORIGIN}/:path*`,
        has,
        statusCode: 301
      }
    ]
  })
  const canonicalLegacy = LEGACY_REDIRECTS.map(([source, destination]) => ({
    source,
    destination,
    statusCode: 301
  }))

  return [...wwwRedirects, ...canonicalLegacy]
}
