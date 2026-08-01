Add a small, pure-neon-red glow to the Arcade button in the mobile bottom nav so it subtly hints that the arcade exists.

Assumptions from the clarification:
- Glow origin: the Arcade button's icon itself (centered on the icon).
- Color: pure neon red (not the arcade rose-red).

Steps:
1. Tokenize the red glow in `src/styles.css`. Add something like `--neon-red: #ef4444;` and `--neon-red-glow: rgba(239, 68, 68, 0.22);` to the `:root` theme so it is reusable and not hardcoded in the component.
2. In `src/components/nav/BottomNav.tsx`, identify the Arcade item (the `Gamepad2` icon in the bottom nav). Wrap its icon with a positioned container that holds a small radial gradient glow behind the icon.
3. Use an absolute pseudo-element or div sized roughly 44-48px, centered behind the 22px icon, with `radial-gradient(circle at center, var(--neon-red-glow) 0%, transparent 70%)`. Keep opacity very low and add a tiny blur so it blends into the dark nav background.
4. Make sure the glow is always visible (not just active state), does not push layout, and remains hidden on desktop because the nav already has `md:hidden`.
5. Preview on a mobile viewport and confirm the glow is only around the Arcade icon, subtle, and not distracting.