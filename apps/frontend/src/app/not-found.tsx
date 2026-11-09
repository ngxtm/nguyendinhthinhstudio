import type { Metadata } from 'next'
import { Source_Serif_4 } from 'next/font/google'
import Image from 'next/image'
import Link from 'next/link'
import styles from './not-found.module.css'

const sourceSerif = Source_Serif_4({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-not-found-serif'
})

export const metadata: Metadata = {
  title: 'Không tìm thấy trang',
  description: 'Trang bạn đang tìm kiếm không tồn tại hoặc đã bị xóa.',
  robots: {
    index: false,
    follow: true
  }
}

function CameraScene() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.viewfinder}>
        <span className={styles.recording}>REC</span>
      </div>

      <div className={styles.collage}>
        <Image
          src="/images/not-found/camera-collage.webp"
          alt=""
          width={1010}
          height={814}
          fetchPriority="high"
          loading="eager"
          unoptimized
        />
        <div className={styles.shutter}>
          <div className={styles.blades}>
            <svg viewBox="0 0 100 100" fill="none" stroke="#827063" strokeOpacity=".42" strokeWidth=".65">
              {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
                <path key={angle} d="M50 50Q55 26 76 7" transform={`rotate(${angle} 50 50)`} />
              ))}
            </svg>
          </div>
        </div>
        <div className={styles.clapper}>
          <div className={styles.clapperArm}>
            <Image
              src="/images/not-found/clapper-arm.webp"
              alt=""
              width={448}
              height={84}
              loading="eager"
              unoptimized
            />
          </div>
        </div>
      </div>

      <div className={styles.print}>
        <Image src="/images/not-found/blank-print.webp" alt="" width={452} height={316} loading="eager" unoptimized />
      </div>
    </div>
  )
}

export default function NotFound() {
  return (
    <main className={`${styles.page} ${sourceSerif.variable}`}>
      <div className={styles.shell}>
        <div className={styles.brand}>NDT STUDIO</div>

        <div className={styles.layout}>
          <div className={styles.copy}>
            <h1 className={styles.title}>
              <span className="sr-only">404 – </span>
              <svg className={styles.code} viewBox="0 0 367 282" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M0 178 57 6h51v172h13v45h-13v55H66v-55H0zm38 0h28V77z
                    M130 74C130 24 149 1 185 1s55 23 55 73v134c0 50-19 73-55 73s-55-23-55-73zm43-12v158c0 12 3 17 12 17s12-5 12-17V62c0-12-3-17-12-17s-12 5-12 17z
                    M246 178 303 6h51v172h13v45h-13v55h-42v-55h-66zm38 0h28V77z"
                />
              </svg>
              Lạc mất khung hình
            </h1>
            <p className={styles.description}>Trang bạn tìm có thể đã được chuyển hoặc không còn tồn tại.</p>
            <Link href="/" className={styles.homeLink} prefetch={false}>
              Về trang chủ
              <svg viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M1 12h36M26 2l11 10-11 10" />
              </svg>
            </Link>
          </div>

          <CameraScene />
        </div>
      </div>
    </main>
  )
}
