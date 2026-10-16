import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const serviceRoutes = [
  {
    layout: '../src/app/(public)/bang-gia/ca-nhan/layout.tsx',
    page: '../src/app/(public)/bang-gia/ca-nhan/page.tsx',
    title: 'Chụp ảnh cá nhân tại Nha Trang - Bảng giá | NDT Studio'
  },
  {
    layout: '../src/app/(public)/bang-gia/couple/layout.tsx',
    page: '../src/app/(public)/bang-gia/couple/page.tsx',
    title: 'Chụp ảnh couple tại Nha Trang - Bảng giá | NDT Studio'
  },
  {
    layout: '../src/app/(public)/bang-gia/gia-dinh/layout.tsx',
    page: '../src/app/(public)/bang-gia/gia-dinh/page.tsx',
    title: 'Chụp ảnh gia đình tại Nha Trang - Bảng giá | NDT Studio'
  },
  {
    layout: '../src/app/(public)/bang-gia/team/layout.tsx',
    page: '../src/app/(public)/bang-gia/team/page.tsx',
    title: 'Chụp ảnh team tại Nha Trang - Bảng giá | NDT Studio'
  },
  {
    layout: '../src/app/(public)/bang-gia/video/layout.tsx',
    page: '../src/app/(public)/bang-gia/video/page.tsx',
    title: 'Bảng giá quay video tại Nha Trang | NDT Studio'
  },
  {
    layout: '../src/app/(public)/bang-gia/wedding/layout.tsx',
    page: '../src/app/(public)/bang-gia/wedding/page.tsx',
    title: 'Chụp ảnh cưới tại Nha Trang - Bảng giá | NDT Studio'
  }
]

test('homepage exposes source-backed local metadata and a meaningful local H1', () => {
  const home = readSource('../src/app/(public)/page.tsx')

  assert.match(home, /title:\s*['"]Studio chụp ảnh tại Nha Trang \| NDT Studio['"]/)
  assert.match(home, /description:\s*['"]Chụp ảnh cưới, gia đình, beauty và couple tại Nha Trang\./)
  assert.match(home, /title="CHỤP ẢNH TẠI NHA TRANG"/)
  assert.match(home, /buttonLink="\/thu-vien"/)
  assert.match(home, /buttonLink="\/lien-he#ho-tro-nhanh"/)
})

test('service metadata is unique, local, and uses one complete brand title', () => {
  const titles = serviceRoutes.map(route => {
    const layout = readSource(route.layout)
    const page = readSource(route.page.replace('/page.tsx', '/PriceClient.tsx'))

    assert.match(layout, /createPublicMetadata/)
    assert.match(layout, new RegExp(`title:\\s*['"]${route.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`))
    assert.match(layout, /description:[\s\S]*Nha Trang/)
    assert.equal((layout.match(/\| NDT Studio/g) ?? []).length, 1)
    assert.equal((page.match(/<h1\b/g) ?? []).length, 1)
    assert.match(page, /TẠI NHA TRANG/)

    return route.title
  })

  assert.equal(new Set(titles).size, serviceRoutes.length)
})

test('pricing and service pages retain crawlable paths to work, portfolio, and booking', () => {
  const pricing = readSource('../src/app/(public)/bang-gia/PricingClient.tsx')
  const pricingModel = readSource('../src/app/(public)/bang-gia/ca-nhan/components/PricingModel.tsx')
  const service = readSource('../src/app/(public)/gioi-thieu/dich-vu/components/ServiceComponent.tsx')

  for (const href of ['/bang-gia/ca-nhan', '/bang-gia/couple', '/bang-gia/wedding', '/bang-gia/video']) {
    assert.match(pricing, new RegExp(href.replaceAll('/', '\\/')))
  }
  assert.match(pricing, /href="\/thu-vien"/)
  assert.match(pricing, /href="\/lien-he#ho-tro-nhanh"/)
  assert.match(pricingModel, /href="\/lien-he#ho-tro-nhanh"/)
  assert.match(service, /href="\/bang-gia"/)
})

test('service image audit replaces generic source-only alt text with observed descriptions', () => {
  const service = readSource('../src/app/(public)/gioi-thieu/dich-vu/components/ServiceComponent.tsx')

  assert.doesNotMatch(service, /alt="studio-experience"/)
  assert.match(service, /alt="Không gian studio chụp ảnh với thiết bị và ánh sáng chuyên dụng"/)
  assert.match(service, /alt="Thiết bị và không gian sản xuất hình ảnh trong studio"/)
})

test('local content does not add incentivized review language or unsupported SEO claims', () => {
  const sources = [
    readSource('../src/app/(public)/page.tsx'),
    ...serviceRoutes.map(route => readSource(route.layout)),
    ...serviceRoutes.map(route => readSource(route.page))
  ].join('\n')

  assert.doesNotMatch(sources, /(?:tặng|ưu đãi|giảm giá)[^\n]*(?:review|đánh giá|số sao)/i)
  assert.doesNotMatch(sources, /cam kết (?:lên top|đứng đầu|tăng hạng)/i)
})
