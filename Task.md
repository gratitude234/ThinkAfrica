 As a UI/UX designer, review ThinkAfrica's frontend. Brand tokens: emerald #10B981 (primary), gold #F59E0B (secondary), purple #7C3AED (accent). Tailwind v3 with custom tokens (emerald-brand, gold, purple-accent).

Audit these files specifically:
- app/(main)/page.tsx — home feed layout and hierarchy
- app/(main)/NavClient.tsx and BottomNav.tsx — nav UX on mobile and desktop
- app/(main)/write/page.tsx — writing experience end to end
- app/(main)/[username]/page.tsx — profile page layout
- components/post/PostCard.tsx — card design and information density
- app/(main)/landing/page.tsx — landing page for logged-out users

For each: flag layout problems, inconsistent spacing, poor visual hierarchy, missing empty states, and mobile responsiveness gaps. Suggest concrete fixes, not vague recommendations.