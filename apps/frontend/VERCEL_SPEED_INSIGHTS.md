# Vercel Speed Insights Setup Guide

## Current Status
✅ **@vercel/speed-insights** package is installed
✅ **SpeedInsights** component is integrated in `src/app/layout.tsx`

## Important Notes

### 1. Speed Insights Only Works in Production
- **Local Development**: Speed Insights **DOES NOT** send data when running `npm run dev` locally
- **Production/Vercel**: Speed Insights automatically works when deployed to Vercel

### 2. How to Verify It's Working

#### Option A: Deploy to Vercel (Recommended)
```bash
# Deploy to Vercel
vercel --prod

# After deployment, visit your site
# Then check Analytics in Vercel Dashboard:
# https://vercel.com/[your-team]/[your-project]/analytics/speed-insights
```

#### Option B: Build and Run Production Locally
```bash
# Build for production
npm run build

# Run production server locally
npm run start

# Visit http://localhost:3000
# Open browser DevTools > Network tab
# Look for requests to: vitals.vercel-insights.com
```

### 3. Viewing Analytics Data
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Navigate to **Analytics** → **Speed Insights**
4. Data will appear after visitors access your production site

### 4. Troubleshooting

#### Speed Insights Not Showing Data?
1. **Check if deployed to Vercel**: Speed Insights only works on Vercel deployments
2. **Wait for data**: It can take a few minutes for data to appear after first visits
3. **Check browser console**: Look for any errors related to speed-insights
4. **Verify component is rendered**: Check if `<SpeedInsights />` is in the DOM

#### Browser Console Commands to Debug
```javascript
// Check if Speed Insights is loaded
window.si

// Check if Web Vitals are being tracked
window.web_vitals
```

### 5. Advanced Configuration (Optional)

If you need to track custom routes or events:

```tsx
// In your page or component
import { useSpeedInsights } from '@vercel/speed-insights/next'

export default function Page() {
  // Track custom events
  const speedInsights = useSpeedInsights()
  
  // Track a custom event
  speedInsights?.track('custom-event', {
    value: 123
  })
  
  return <div>...</div>
}
```

### 6. Environment Variables (Optional)

Add to `.env.production` or Vercel Dashboard:

```env
# Disable Speed Insights (if needed)
NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS_DISABLED=true

# Custom configuration
NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS_DEBUG=true
```

## Resources
- [Vercel Speed Insights Documentation](https://vercel.com/docs/speed-insights)
- [Web Vitals](https://web.dev/vitals/)
- [Vercel Analytics Dashboard](https://vercel.com/analytics)
