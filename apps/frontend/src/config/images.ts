interface HeroImage {
  src: string
  alt: string
  priority?: boolean
}

const CLOUDFLARE_BASE_URL = 'https://imagedelivery.net/VfR4OrediSNsliNstI-Q2A'
const VARIANT = 'public'

const heroImageIds = [
  '09389f8a-bd47-409d-f057-c456f492da00',
  'be5b07b5-3a85-48f7-af0c-8e8a778b7f00',
  '444f1148-63fd-43f6-111f-7503dfc40700',
  '1d54a960-726a-41af-a31a-778f8ff87900'
]

export const heroImages: HeroImage[] = heroImageIds.map((id, index) => ({
  src: `${CLOUDFLARE_BASE_URL}/${id}/${VARIANT}`,
  alt: `Hero Image ${index + 1}`,
  priority: index === 0
}))
