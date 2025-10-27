interface CloudFlareImage {
  src: string
  alt: string
  priority?: boolean
}

const CLOUDFLARE_BASE_URL = 'https://imagedelivery.net/VfR4OrediSNsliNstI-Q2A'
const VARIANT = 'public'

//** HERO IMAGE */

const heroImageIds = [
  '09389f8a-bd47-409d-f057-c456f492da00',
  'be5b07b5-3a85-48f7-af0c-8e8a778b7f00',
  '444f1148-63fd-43f6-111f-7503dfc40700',
  '1d54a960-726a-41af-a31a-778f8ff87900'
]

//** COLLECTION */

const collection = [
  'b1799cea-19c8-478a-fd08-cbb64b633f00', // New Collection
  'b33f71fd-e65c-42dc-f50b-ceb2dfc51400', // Collection 1
  '4b41393a-7fbe-4c33-2cfe-4aea40447500', // Collection 2
  'a9b39412-e44b-4bf9-f101-8838a8096000', // Collection 3
  '098f40e8-2e7a-4bac-a4e9-1c75dcdbfe00', // Collection 4
  '9d7c5ca4-9072-4a45-3d46-c907d4b74b00' // Collection 5
]

export const heroImages: CloudFlareImage[] = heroImageIds.map((id, index) => ({
  src: `${CLOUDFLARE_BASE_URL}/${id}/${VARIANT}`,
  alt: `Hero Image ${index + 1}`,
  priority: index === 0
}))

export const collectionImages: CloudFlareImage[] = collection.map((id, index) => ({
  src: `${CLOUDFLARE_BASE_URL}/${id}/${VARIANT}`,
  alt: `Collection Image ${index + 1}`,
  priority: index === 0
}))
