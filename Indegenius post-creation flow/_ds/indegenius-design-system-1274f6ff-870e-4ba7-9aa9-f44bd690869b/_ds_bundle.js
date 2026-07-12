/* @ds-bundle: {"format":4,"namespace":"IndegeniusDesignSystem_1274f6","components":[{"name":"FollowButton","sourcePath":"components/actions/FollowButton.jsx"},{"name":"IconButton","sourcePath":"components/actions/IconButton.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Pill","sourcePath":"components/core/Pill.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"PointsTierBadge","sourcePath":"components/data-display/PointsTierBadge.jsx"},{"name":"UserAvatar","sourcePath":"components/data-display/UserAvatar.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"SkeletonCard","sourcePath":"components/feedback/SkeletonCard.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"}],"sourceHashes":{"components/actions/FollowButton.jsx":"70296c85308b","components/actions/IconButton.jsx":"9113da766ed0","components/core/Badge.jsx":"22cec6acf3fe","components/core/Button.jsx":"4b74c145b636","components/core/Pill.jsx":"87e9ef2db65c","components/core/Tag.jsx":"a77187662e09","components/data-display/PointsTierBadge.jsx":"8b4fbb48c28c","components/data-display/UserAvatar.jsx":"032203bba459","components/feedback/EmptyState.jsx":"03a1f429171f","components/feedback/SkeletonCard.jsx":"8c2c9f2cea27","components/feedback/Toast.jsx":"42942b5c74ef","ui_kits/app/AppChrome.jsx":"d1e3ea4d176b","ui_kits/app/DebatesScreen.jsx":"82b4ca8a130f","ui_kits/app/HomeScreen.jsx":"bde0e2da26ed","ui_kits/app/ProfileScreen.jsx":"10758594005c","ui_kits/marketing/LandingChrome.jsx":"3506dc214f25","ui_kits/marketing/LandingContent.jsx":"c717e565b72b","ui_kits/marketing/LandingDebates.jsx":"100a60e81979","ui_kits/marketing/LandingHero.jsx":"77edb3b67992"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.IndegeniusDesignSystem_1274f6 = window.IndegeniusDesignSystem_1274f6 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/actions/FollowButton.jsx
try { (() => {
/**
 * Follow/following toggle button. Mirrors components/ui/FollowButton.tsx — pill button that
 * flips between a solid "Follow" and an outlined "Following" state.
 */
function FollowButton({
  following = false,
  onToggle
}) {
  const [isFollowing, setIsFollowing] = React.useState(following);
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setIsFollowing(f => !f);
      onToggle && onToggle(!isFollowing);
    },
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-full)',
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      fontWeight: 600,
      padding: '6px 16px',
      cursor: 'pointer',
      transition: 'background-color 150ms, color 150ms, border-color 150ms',
      border: isFollowing ? '1px solid var(--gray-300)' : '1px solid transparent',
      background: isFollowing ? hover ? '#FEE2E2' : '#fff' : hover ? 'var(--brand-emerald-hover)' : 'var(--color-accent-primary)',
      color: isFollowing ? hover ? 'var(--red-700)' : 'var(--gray-700)' : '#fff'
    }
  }, isFollowing ? hover ? 'Unfollow' : 'Following' : 'Follow');
}
Object.assign(__ds_scope, { FollowButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/FollowButton.jsx", error: String((e && e.message) || e) }); }

// components/actions/IconButton.jsx
try { (() => {
/**
 * Square icon-only button for nav bars and toolbars. Not a component in the source repo —
 * an intentional addition (see readme.md → "Intentional additions") that wraps the inline
 * stroke-SVG icon pattern used throughout NavClient/BottomNav/NotificationBell into a
 * reusable hit target.
 */
function IconButton({
  children,
  badge,
  size = 34,
  onClick,
  label
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    "aria-label": label,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      width: size,
      height: size,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-sm)',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--text-ink-muted)',
      background: hover ? 'var(--color-bg-page)' : 'transparent',
      transition: 'background-color 150ms, color 150ms'
    }
  }, children, badge ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -2,
      right: -2,
      minWidth: 16,
      height: 16,
      borderRadius: 999,
      background: 'var(--red-500)',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 3px'
    }
  }, badge) : null);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
const TYPE_STYLES = {
  blog: {
    bg: 'var(--type-blog-bg)',
    color: 'var(--type-blog)'
  },
  essay: {
    bg: 'var(--type-essay-bg)',
    color: 'var(--type-essay)'
  },
  research: {
    bg: 'var(--type-research-bg)',
    color: 'var(--type-research)'
  },
  policy_brief: {
    bg: 'var(--type-policy-bg)',
    color: 'var(--type-policy)'
  },
  quick_take: {
    bg: 'var(--type-blog-bg)',
    color: 'var(--type-blog)'
  }
};
const TYPE_LABELS = {
  blog: 'Blog',
  essay: 'Essay',
  research: 'Research',
  policy_brief: 'Policy Brief',
  quick_take: 'Quick Take'
};

/**
 * Post-type identity badge. Mirrors components/ui/Badge.tsx — colors the label by content
 * type (blog/essay/research/policy brief) using the brand's tint palette.
 */
function Badge({
  type = 'blog',
  children
}) {
  const s = TYPE_STYLES[type] || {
    bg: 'var(--gray-100)',
    color: 'var(--gray-700)'
  };
  const label = children ?? TYPE_LABELS[type] ?? type;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 'var(--radius-full)',
      padding: '2px 10px',
      fontSize: '10.5px',
      fontWeight: 600,
      whiteSpace: 'nowrap',
      fontFamily: 'var(--font-sans)',
      background: s.bg,
      color: s.color
    }
  }, label);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
const VARIANT_STYLES = {
  primary: {
    bg: 'var(--color-accent-primary)',
    color: '#fff',
    border: 'none'
  },
  secondary: {
    bg: '#fff',
    color: 'var(--gray-700)',
    border: '1px solid var(--gray-300)'
  },
  danger: {
    bg: 'var(--color-danger)',
    color: '#fff',
    border: 'none'
  },
  ghost: {
    bg: 'transparent',
    color: 'var(--gray-600)',
    border: 'none'
  },
  gold: {
    bg: 'var(--amber-500)',
    color: '#fff',
    border: 'none'
  }
};
const VARIANT_HOVER = {
  primary: {
    bg: 'var(--color-accent-primary-hover)'
  },
  secondary: {
    bg: 'var(--color-bg-page)'
  },
  danger: {
    bg: 'var(--red-700)'
  },
  ghost: {
    bg: 'var(--gray-100)',
    color: 'var(--gray-900)'
  },
  gold: {
    bg: '#D97706'
  }
};
const SIZE_STYLES = {
  sm: {
    padding: '6px 12px',
    fontSize: '13px'
  },
  md: {
    padding: '8px 16px',
    fontSize: '13px'
  },
  lg: {
    padding: '12px 24px',
    fontSize: '15px'
  }
};

/**
 * Primary UI button. Mirrors components/ui/Button.tsx from the Indegenius codebase:
 * five variants (primary/secondary/danger/ghost/gold), three sizes, an inline loading spinner.
 */
function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  children,
  onClick,
  style,
  type = 'button'
}) {
  const [hover, setHover] = React.useState(false);
  const v = VARIANT_STYLES[variant] || VARIANT_STYLES.primary;
  const vh = VARIANT_HOVER[variant] || {};
  const s = SIZE_STYLES[size] || SIZE_STYLES.md;
  const isDisabled = disabled || loading;
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    onClick: onClick,
    disabled: isDisabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      fontFamily: 'var(--font-sans)',
      fontWeight: 500,
      whiteSpace: 'nowrap',
      borderRadius: 'var(--radius-sm)',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      transition: 'background-color 150ms, color 150ms',
      opacity: isDisabled ? 0.5 : 1,
      background: hover && !isDisabled ? vh.bg ?? v.bg : v.bg,
      color: hover && !isDisabled ? vh.color ?? v.color : v.color,
      border: v.border,
      padding: s.padding,
      fontSize: s.fontSize,
      ...style
    }
  }, loading ? /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    style: {
      animation: 'spin 0.8s linear infinite'
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10",
    stroke: "currentColor",
    strokeWidth: "4",
    opacity: "0.25"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z",
    fill: "currentColor",
    opacity: "0.75"
  })) : null, children, /*#__PURE__*/React.createElement("style", null, `@keyframes spin { to { transform: rotate(360deg); } }`));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Pill.jsx
try { (() => {
const VARIANTS = {
  neutral: {
    bg: 'var(--gray-100)',
    color: 'var(--gray-700)'
  },
  emerald: {
    bg: 'var(--emerald-100)',
    color: 'var(--emerald-700)'
  },
  amber: {
    bg: 'var(--amber-100)',
    color: 'var(--amber-800)'
  },
  purple: {
    bg: 'var(--purple-100)',
    color: 'var(--purple-700)'
  },
  gray: {
    bg: 'var(--gray-100)',
    color: 'var(--gray-500)'
  },
  red: {
    bg: '#FEE2E2',
    color: 'var(--red-700)'
  }
};
const SIZES = {
  sm: {
    padding: '2px 8px',
    fontSize: '12px'
  },
  md: {
    padding: '4px 10px',
    fontSize: '14px'
  }
};

/**
 * General-purpose status/metadata pill. Mirrors components/ui/Pill.tsx — used for tier
 * badges, signal chips ("Reviewed", "Citable", "Co-author"), and topic counts.
 */
function Pill({
  variant = 'neutral',
  size = 'sm',
  children
}) {
  const v = VARIANTS[variant] || VARIANTS.neutral;
  const s = SIZES[size] || SIZES.sm;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      borderRadius: 'var(--radius-full)',
      fontWeight: 500,
      fontFamily: 'var(--font-sans)',
      background: v.bg,
      color: v.color,
      padding: s.padding,
      fontSize: s.fontSize
    }
  }, children);
}
Object.assign(__ds_scope, { Pill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Pill.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
/**
 * Hashtag/topic tag. Mirrors components/ui/Tag.tsx — a quiet gray pill prefixed with "#",
 * used on post cards and topic-browse rows.
 */
function Tag({
  label
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("span", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 'var(--radius-full)',
      padding: '2px 10px',
      fontSize: '12px',
      fontWeight: 500,
      fontFamily: 'var(--font-sans)',
      background: hover ? 'var(--gray-200)' : 'var(--gray-100)',
      color: 'var(--gray-600)',
      transition: 'background-color 150ms',
      cursor: 'pointer'
    }
  }, "#", label);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/data-display/PointsTierBadge.jsx
try { (() => {
const TIERS = [{
  min: 0,
  name: 'Contributor'
}, {
  min: 300,
  name: 'Scholar'
}, {
  min: 1500,
  name: 'Fellow'
}, {
  min: 5000,
  name: 'Laureate'
}];
function tierFor(points) {
  return [...TIERS].reverse().find(t => points >= t.min) || TIERS[0];
}

/**
 * Reputation/points tier chip. Recreates the amber tier pill used in DailyBriefStrip /
 * CredentialsCard (e.g. "Scholar · 260 pts to Fellow").
 */
function PointsTierBadge({
  points = 0,
  showProgress = true
}) {
  const tier = tierFor(points);
  const idx = TIERS.indexOf(tier);
  const next = TIERS[idx + 1];
  const toNext = next ? next.min - points : 0;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      borderRadius: 'var(--radius-full)',
      background: 'var(--amber-100)',
      color: 'var(--amber-800)',
      fontFamily: 'var(--font-sans)',
      fontSize: 11,
      fontWeight: 600,
      padding: '4px 10px'
    }
  }, tier.name, showProgress && next ? /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.75,
      fontWeight: 500
    }
  }, "\xB7 ", toNext, " pts to ", next.name) : null);
}
Object.assign(__ds_scope, { PointsTierBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/PointsTierBadge.jsx", error: String((e && e.message) || e) }); }

// components/data-display/UserAvatar.jsx
try { (() => {
/* Same 5-color deterministic palette as the product's boring-avatars fallback */
const PALETTE = ['#073929', '#CE932B', '#391A60', '#0EA5E9', '#EF4444'];
function hashName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = h * 31 + name.charCodeAt(i) >>> 0;
  return h;
}
function initials(name) {
  return name.split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * Circular user avatar. Mirrors components/ui/UserAvatar.tsx — renders the real photo when
 * `src` is provided, otherwise a deterministic colored initials circle (product uses the
 * boring-avatars "beam" style; this recreation uses a flat initials circle from the same palette).
 */
function UserAvatar({
  name,
  src,
  size = 40
}) {
  if (src) {
    return /*#__PURE__*/React.createElement("img", {
      src: src,
      alt: name,
      width: size,
      height: size,
      style: {
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        display: 'block'
      }
    });
  }
  const color = PALETTE[hashName(name) % PALETTE.length];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: size * 0.38,
      flexShrink: 0
    }
  }, initials(name));
}
Object.assign(__ds_scope, { UserAvatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/UserAvatar.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
/**
 * Empty-state placeholder for feeds/lists with no content yet. Mirrors
 * components/ui/EmptyState.tsx — centered title + description + an optional primary CTA link.
 */
function EmptyState({
  title,
  description,
  ctaLabel,
  onCta
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '64px 16px',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--gray-700)',
      margin: '0 0 4px'
    }
  }, title), description ? /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--text-ink-faint)',
      margin: '0 0 20px'
    }
  }, description) : null, ctaLabel ? /*#__PURE__*/React.createElement("button", {
    onClick: onCta,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--color-accent-primary)',
      color: '#fff',
      fontSize: 14,
      fontWeight: 500,
      border: 'none',
      padding: '8px 16px',
      cursor: 'pointer'
    }
  }, ctaLabel) : null);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/SkeletonCard.jsx
try { (() => {
const bar = (w, extra) => ({
  height: 14,
  width: w,
  borderRadius: 6,
  background: 'var(--gray-200)',
  ...extra
});

/**
 * Loading skeleton placeholder. Mirrors components/ui/SkeletonCard.tsx's three shapes
 * (post/profile/debate) behind one `variant` prop, pulse-animated.
 */
function SkeletonCard({
  variant = 'post'
}) {
  const wrap = {
    background: '#fff',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: 20,
    animation: 'ds-pulse 1.5s ease-in-out infinite'
  };
  if (variant === 'profile') {
    return /*#__PURE__*/React.createElement("div", {
      style: wrap
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 16,
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: 'var(--gray-200)',
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: bar('60%', {
        marginBottom: 8
      })
    }), /*#__PURE__*/React.createElement("div", {
      style: bar('40%', {
        height: 10,
        background: 'var(--gray-100)'
      })
    }))), /*#__PURE__*/React.createElement("div", {
      style: bar('100%', {
        height: 10,
        background: 'var(--gray-100)',
        marginBottom: 6
      })
    }), /*#__PURE__*/React.createElement("div", {
      style: bar('80%', {
        height: 10,
        background: 'var(--gray-100)'
      })
    }), /*#__PURE__*/React.createElement("style", null, `@keyframes ds-pulse { 0%,100%{opacity:1} 50%{opacity:.6} }`));
  }
  if (variant === 'debate') {
    return /*#__PURE__*/React.createElement("div", {
      style: wrap
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        marginBottom: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        ...bar('64px'),
        borderRadius: 999
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        ...bar('80px', {
          background: 'var(--gray-100)'
        }),
        borderRadius: 999
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: bar('75%', {
        marginBottom: 8
      })
    }), /*#__PURE__*/React.createElement("div", {
      style: bar('100%', {
        height: 10,
        background: 'var(--gray-100)'
      })
    }), /*#__PURE__*/React.createElement("style", null, `@keyframes ds-pulse { 0%,100%{opacity:1} 50%{opacity:.6} }`));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...bar('64px'),
      borderRadius: 999
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: bar('48px', {
      height: 10,
      background: 'var(--gray-100)'
    })
  })), /*#__PURE__*/React.createElement("div", {
    style: bar('80%', {
      height: 18,
      marginBottom: 10
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: bar('100%', {
      height: 12,
      background: 'var(--gray-100)',
      marginBottom: 6
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: bar('60%', {
      height: 12,
      background: 'var(--gray-100)'
    })
  }), /*#__PURE__*/React.createElement("style", null, `@keyframes ds-pulse { 0%,100%{opacity:1} 50%{opacity:.6} }`));
}
Object.assign(__ds_scope, { SkeletonCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/SkeletonCard.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
/**
 * Bottom-anchored transient confirmation toast. Mirrors components/ui/Toast.tsx — a dark
 * pill that auto-dismisses (product default: 4s) and slides up on entrance.
 */
function Toast({
  message
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      borderRadius: 'var(--radius-full)',
      background: 'var(--gray-900)',
      color: '#fff',
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      fontWeight: 500,
      padding: '12px 20px',
      boxShadow: 'var(--shadow-popover)',
      animation: 'toast-up 0.25s ease-out'
    }
  }, message, /*#__PURE__*/React.createElement("style", null, `@keyframes toast-up { from { opacity: 0; transform: translateY(12px);} to { opacity: 1; transform: translateY(0);} }`));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/AppChrome.jsx
try { (() => {
// Shared app chrome: sticky top nav (desktop) + bottom tab bar (mobile), matching
// NavClient.tsx / BottomNav.tsx from the source repo.

function AppTopNav({
  active,
  onNavigate
}) {
  const {
    IconButton
  } = window.IndegeniusDesignSystem_1274f6;
  const items = ['Home', 'Explore', 'Debates', 'Opportunities'];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--brand-emerald)',
      padding: '6px 0',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.2em',
      color: 'var(--brand-gold)'
    }
  }, "Africa's intellectual social network")), /*#__PURE__*/React.createElement("nav", {
    style: {
      height: 60,
      borderBottom: '1px solid var(--color-border)',
      background: '#fff'
    },
    className: "app-top-nav"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1240,
      margin: '0 auto',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 28,
      padding: '0 24px'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/indegenius-icon-wordmark-color.svg",
    alt: "Indegenius",
    style: {
      height: 26
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4
    },
    className: "app-top-nav-links"
  }, items.map(it => /*#__PURE__*/React.createElement("span", {
    key: it,
    onClick: () => onNavigate(it),
    style: {
      padding: '8px 12px',
      borderRadius: 8,
      fontSize: 13.5,
      fontWeight: 500,
      cursor: 'pointer',
      background: active === it ? 'var(--color-bg-page)' : 'transparent',
      color: active === it ? 'var(--text-ink)' : 'var(--text-ink-muted)'
    }
  }, it))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    label: "Search"
  }, /*#__PURE__*/React.createElement(SearchIcon, null)), /*#__PURE__*/React.createElement(IconButton, {
    label: "Notifications",
    badge: 3
  }, /*#__PURE__*/React.createElement(BellIcon, null)), /*#__PURE__*/React.createElement("span", {
    onClick: () => onNavigate('Profile'),
    style: {
      cursor: 'pointer',
      marginLeft: 6,
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(window.IndegeniusDesignSystem_1274f6.UserAvatar, {
    name: "Gratitude Olanibi",
    size: 32
  }))))));
}
function AppBottomNav({
  active,
  onNavigate
}) {
  const tabs = [{
    key: 'Home',
    icon: /*#__PURE__*/React.createElement(HomeIcon, null)
  }, {
    key: 'Explore',
    icon: /*#__PURE__*/React.createElement(SearchIcon, null)
  }, {
    key: 'Debates',
    icon: /*#__PURE__*/React.createElement(DebateIcon, null)
  }, {
    key: 'Profile',
    icon: /*#__PURE__*/React.createElement(PersonIcon, null)
  }];
  return /*#__PURE__*/React.createElement("nav", {
    className: "app-bottom-nav",
    style: {
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 60,
      background: '#fff',
      borderTop: '1px solid var(--color-border-soft)',
      boxShadow: '0 -2px 12px -2px rgba(0,0,0,0.06)',
      display: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'space-around'
    }
  }, tabs.map(t => /*#__PURE__*/React.createElement("div", {
    key: t.key,
    onClick: () => onNavigate(t.key),
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
      cursor: 'pointer',
      color: active === t.key ? 'var(--brand-emerald)' : 'var(--gray-500)'
    }
  }, t.icon, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 500
    }
  }, t.key)))));
}
function BellIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3C7.7 6.2 6 8.4 6 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
  }));
}
function SearchIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21 21l-4.35-4.35m1.1-5.4a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
  }));
}
function HomeIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 10.75L12 3l9 7.75V21H14.75v-5.5h-5.5V21H3V10.75z"
  }));
}
function DebateIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 8.5h10M7 12.25h6.5M5.75 19 9 15.75h8.25A2.75 2.75 0 0020 13V7.75A2.75 2.75 0 0017.25 5H6.75A2.75 2.75 0 004 7.75V13a2.75 2.75 0 002.75 2.75H7V19z"
  }));
}
function PersonIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 21a8 8 0 10-16 0m12-11a4 4 0 11-8 0 4 4 0 018 0z"
  }));
}
window.AppTopNav = AppTopNav;
window.AppBottomNav = AppBottomNav;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/AppChrome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/DebatesScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Debates screen: live motion-vote panel + open debates list.
// Mirrors app/(main)/debates/page.tsx composition.

function MotionVotePanel() {
  const [voted, setVoted] = React.useState(null);
  const forPct = 63,
    againstPct = 37;
  return /*#__PURE__*/React.createElement("section", {
    style: {
      borderRadius: 12,
      background: 'var(--gray-900)',
      color: '#fff',
      padding: 24,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: 'var(--emerald-400, #34D399)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.15em',
      color: '#6EE7B7'
    }
  }, "Live debate"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontSize: 12,
      color: '#9CA3AF'
    }
  }, "412 votes \xB7 3h left")), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 24,
      fontWeight: 600,
      lineHeight: 1.2,
      margin: '0 0 20px'
    }
  }, "Nigeria should declare a state of emergency on its education system"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setVoted('for'),
    style: {
      borderRadius: 10,
      border: 'none',
      padding: '14px 0',
      textAlign: 'center',
      cursor: 'pointer',
      background: voted === 'for' ? 'var(--brand-emerald)' : 'rgba(255,255,255,0.08)',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 2
    }
  }, "For"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 700
    }
  }, forPct, "%")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setVoted('against'),
    style: {
      borderRadius: 10,
      border: 'none',
      padding: '14px 0',
      textAlign: 'center',
      cursor: 'pointer',
      background: voted === 'against' ? 'var(--purple-500, #A855F7)' : 'rgba(255,255,255,0.08)',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 2
    }
  }, "Against"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 700
    }
  }, againstPct, "%"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: 6,
      borderRadius: 999,
      overflow: 'hidden',
      background: 'rgba(255,255,255,0.1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${forPct}%`,
      background: 'var(--stance-for)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${againstPct}%`,
      background: 'var(--stance-against)'
    }
  })));
}
function DebateRow({
  title,
  forPct,
  status,
  votes
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      background: '#fff',
      padding: '16px 18px',
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 16,
      fontWeight: 600,
      margin: '0 0 10px',
      color: 'var(--text-ink)'
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: 5,
      borderRadius: 999,
      overflow: 'hidden',
      background: 'var(--gray-100)',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${forPct}%`,
      background: 'var(--stance-for)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${100 - forPct}%`,
      background: 'var(--stance-against)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 11.5,
      color: 'var(--text-ink-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", null, status), /*#__PURE__*/React.createElement("span", null, votes, " votes")));
}
function DebatesScreen() {
  const {
    Pill
  } = window.IndegeniusDesignSystem_1274f6;
  const debates = [{
    title: 'African languages should be the primary medium of instruction in primary schools',
    forPct: 55,
    status: 'Open · 12h left',
    votes: 189
  }, {
    title: 'Coding should be a compulsory subject in all African secondary schools by 2030',
    forPct: 71,
    status: 'Open · 2d left',
    votes: 2100
  }, {
    title: 'The AU should impose sanctions on states that fail minimum education spending benchmarks',
    forPct: 40,
    status: 'Closed · Recap available',
    votes: 3400
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 760,
      margin: '0 auto',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 28,
      fontWeight: 600,
      margin: 0,
      color: 'var(--text-ink)'
    }
  }, "Debates"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Pill, {
    variant: "emerald"
  }, "All"), /*#__PURE__*/React.createElement(Pill, {
    variant: "gray"
  }, "Policy"), /*#__PURE__*/React.createElement(Pill, {
    variant: "gray"
  }, "Tech"))), /*#__PURE__*/React.createElement(MotionVotePanel, null), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      color: 'var(--text-ink-muted)',
      margin: '0 0 12px'
    }
  }, "Open debates"), debates.map(d => /*#__PURE__*/React.createElement(DebateRow, _extends({
    key: d.title
  }, d))));
}
window.DebatesScreen = DebatesScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/DebatesScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/HomeScreen.jsx
try { (() => {
// Home feed screen: DailyBriefStrip + FeaturedPostLead + PostCard feed + HomeSidebar.
// Mirrors app/(main)/page.tsx composition.

function DailyBriefStripDemo() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      borderRadius: 12,
      border: '1px solid var(--color-border)',
      borderLeft: '3px solid var(--brand-emerald)',
      background: '#fff',
      padding: '14px 16px',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flexShrink: 0,
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.16em',
      color: 'var(--brand-emerald)'
    }
  }, "Wed, Jul 8"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 20,
      width: 1,
      background: 'var(--color-border)'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      color: 'var(--gray-700)',
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--text-ink)'
    }
  }, "Top post:"), " Why African Universities Must Decolonise the Curriculum", /*#__PURE__*/React.createElement("span", {
    style: {
      margin: '0 10px'
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--text-ink)'
    }
  }, "Live debate:"), " Should African universities adopt English-only instruction policies? \xB7 142 arguments"), /*#__PURE__*/React.createElement(window.IndegeniusDesignSystem_1274f6.PointsTierBadge, {
    points: 1240
  }));
}
function FeaturedPostLeadDemo() {
  return /*#__PURE__*/React.createElement("article", {
    style: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 12,
      padding: '24px 28px',
      color: '#fff',
      marginBottom: 20,
      background: 'linear-gradient(135deg, var(--brand-emerald), #0E4B37)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 16,
      bottom: -12,
      fontFamily: 'var(--font-display)',
      fontSize: 130,
      fontWeight: 700,
      color: 'rgba(255,255,255,0.08)',
      lineHeight: 1
    }
  }, "B"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: 560
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      color: 'rgba(255,255,255,0.65)'
    }
  }, "Editor's pick"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'rgba(255,255,255,0.35)'
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      color: 'rgba(255,255,255,0.5)'
    }
  }, "Blog \xB7 4 min")), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 26,
      fontWeight: 600,
      lineHeight: 1.16,
      margin: '0 0 10px'
    }
  }, "What My First Year of Medical School Taught Me About Grief"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      lineHeight: 1.6,
      color: 'rgba(255,255,255,0.7)',
      margin: '0 0 20px'
    }
  }, "I didn't expect the cadavers to be the easy part. A reflection on losing my grandmother during my first anatomy rotation."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(window.IndegeniusDesignSystem_1274f6.UserAvatar, {
    name: "Tendai Moyo",
    size: 32
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      fontWeight: 600
    }
  }, "Tendai Moyo"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 11.5,
      color: 'rgba(255,255,255,0.55)'
    }
  }, "University of Zimbabwe")), /*#__PURE__*/React.createElement("button", {
    style: {
      marginLeft: 'auto',
      background: 'rgba(255,255,255,0.15)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: 8,
      color: '#fff',
      fontSize: 13,
      fontWeight: 600,
      padding: '8px 16px',
      cursor: 'pointer'
    }
  }, "Read \u2192"))));
}
function PostCardDemo({
  post
}) {
  const {
    Badge
  } = window.IndegeniusDesignSystem_1274f6;
  const gradient = {
    blog: 'linear-gradient(135deg, var(--brand-emerald), #0E4B37)',
    essay: 'linear-gradient(135deg, var(--brand-gold-ink), var(--brand-gold))',
    research: 'linear-gradient(135deg, var(--brand-purple), #6B4A94)',
    policy_brief: 'linear-gradient(135deg, var(--brand-purple), #6B4A94)'
  }[post.type];
  const stamp = {
    blog: 'B',
    essay: 'E',
    research: 'R',
    policy_brief: 'P'
  }[post.type];
  return /*#__PURE__*/React.createElement("article", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 88px',
      gap: 16,
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      background: '#fff',
      padding: '16px 18px',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    type: post.type
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      color: 'var(--text-ink-muted)'
    }
  }, post.reading), post.reviewed ? /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      border: '1px solid var(--emerald-200)',
      background: 'var(--emerald-50)',
      color: 'var(--emerald-700)',
      fontSize: 10.5,
      fontWeight: 600,
      padding: '2px 8px'
    }
  }, "Reviewed") : null), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 17,
      fontWeight: 600,
      lineHeight: 1.28,
      margin: '0 0 6px',
      color: 'var(--text-ink)'
    }
  }, post.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      lineHeight: 1.5,
      color: 'var(--gray-500)',
      margin: '0 0 10px'
    }
  }, post.excerpt), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      borderTop: '1px solid var(--color-border-soft)',
      paddingTop: 10
    }
  }, /*#__PURE__*/React.createElement(window.IndegeniusDesignSystem_1274f6.UserAvatar, {
    name: post.author,
    size: 24
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-ink-muted)'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--gray-700)'
    }
  }, post.author), " \xB7 ", post.uni, " \xB7 ", post.date), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontSize: 11.5,
      color: 'var(--gray-500)'
    }
  }, "\u2665 ", post.likes))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 9,
      background: gradient,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
      padding: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 40,
      fontWeight: 700,
      color: 'rgba(255,255,255,0.16)',
      lineHeight: 1
    }
  }, stamp)));
}
function HomeSidebarDemo() {
  const {
    Pill
  } = window.IndegeniusDesignSystem_1274f6;
  const topics = ['Policy', 'Health Systems', 'Technology', 'Climate', 'Education'];
  const people = [{
    name: 'Fatima Diallo',
    uni: 'Cheikh Anta Diop University'
  }, {
    name: 'Kwame Boateng',
    uni: 'University of Ghana'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("section", {
    style: {
      borderRadius: 12,
      border: '1px solid var(--emerald-200)',
      background: 'rgba(236,253,245,0.4)',
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 4px',
      fontSize: 10.5,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.16em',
      color: 'var(--emerald-700)'
    }
  }, "First contribution"), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 6px',
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--text-ink)'
    }
  }, "Complete your student profile"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 10px',
      fontSize: 12,
      lineHeight: 1.5,
      color: 'var(--text-ink-muted)'
    }
  }, "Add your university and field of study so readers can verify your credentials."), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 4,
      borderRadius: 999,
      background: 'var(--gray-100)',
      marginBottom: 10,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '40%',
      height: '100%',
      background: 'var(--brand-emerald)'
    }
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      width: '100%',
      background: 'var(--brand-emerald)',
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      padding: '8px 0',
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer'
    }
  }, "Continue setup")), /*#__PURE__*/React.createElement("section", {
    style: {
      borderRadius: 12,
      border: '1px solid var(--color-border)',
      background: '#fff',
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 10px',
      fontSize: 10.5,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.16em',
      color: 'var(--text-ink-muted)'
    }
  }, "Browse by topic"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6
    }
  }, topics.map(t => /*#__PURE__*/React.createElement(Pill, {
    key: t,
    variant: "neutral"
  }, t)))), /*#__PURE__*/React.createElement("section", {
    style: {
      borderRadius: 12,
      border: '1px solid var(--color-border)',
      background: '#fff',
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 10px',
      fontSize: 10.5,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.16em',
      color: 'var(--text-ink-muted)'
    }
  }, "Writers to follow"), people.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.name,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 0',
      borderBottom: '1px solid var(--color-border-soft)'
    }
  }, /*#__PURE__*/React.createElement(window.IndegeniusDesignSystem_1274f6.UserAvatar, {
    name: p.name,
    size: 36
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--text-ink)'
    }
  }, p.name), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 11,
      color: 'var(--text-ink-muted)'
    }
  }, p.uni)), /*#__PURE__*/React.createElement(window.IndegeniusDesignSystem_1274f6.FollowButton, null)))));
}
function HomeScreen() {
  const posts = [{
    type: 'essay',
    title: 'The Hidden Cost of Studying Abroad',
    excerpt: 'Brain drain isn\u2019t just statistics. It\u2019s the slow erosion of belonging.',
    author: 'Ngozi Eze',
    uni: 'University of Lagos',
    date: '4d ago',
    reading: '6 min read',
    likes: 218,
    reviewed: true
  }, {
    type: 'research',
    title: 'Mobile Money Adoption Among Rural Cooperatives in East Africa',
    excerpt: 'A field study across 40 savings groups in western Kenya.',
    author: 'Kwame Boateng',
    uni: 'University of Ghana',
    date: '2d ago',
    reading: 'PDF manuscript',
    likes: 94,
    reviewed: true
  }, {
    type: 'policy_brief',
    title: 'Reforming Fuel Subsidies Without Triggering Unrest',
    excerpt: 'A phased-withdrawal model drawing on Nigeria\u2019s 2012 experience.',
    author: 'Fatima Diallo',
    uni: 'Cheikh Anta Diop University',
    date: '5d ago',
    reading: '9 min read',
    likes: 61,
    reviewed: true
  }, {
    type: 'blog',
    title: 'Notes From My First Ambassador Trip',
    excerpt: 'What three campus info sessions taught me about outreach.',
    author: 'Sena Mensah',
    uni: 'KNUST',
    date: '1w ago',
    reading: '3 min read',
    likes: 42,
    reviewed: false
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1080,
      margin: '0 auto',
      padding: '24px',
      display: 'grid',
      gridTemplateColumns: '1fr 320px',
      gap: 24
    },
    className: "app-home-grid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(DailyBriefStripDemo, null), /*#__PURE__*/React.createElement(FeaturedPostLeadDemo, null), posts.map(p => /*#__PURE__*/React.createElement(PostCardDemo, {
    key: p.title,
    post: p
  }))), /*#__PURE__*/React.createElement(HomeSidebarDemo, null));
}
window.HomeScreen = HomeScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ProfileScreen.jsx
try { (() => {
// Profile screen: ProfileHeader + CredentialsCard + posts list.
// Mirrors components/profile/ProfileHeader.tsx + CredentialsCard.tsx.

function ProfileScreen() {
  const {
    Badge,
    Pill,
    PointsTierBadge,
    UserAvatar
  } = window.IndegeniusDesignSystem_1274f6;
  const [tab, setTab] = React.useState('Posts');
  const stats = [{
    label: 'Publications',
    value: 12
  }, {
    label: 'Citable',
    value: 4
  }, {
    label: 'Reviewed',
    value: 9
  }, {
    label: 'Co-authored',
    value: 2
  }, {
    label: 'Reads',
    value: '2.1k'
  }];
  const posts = [{
    type: 'essay',
    title: "What Nigeria's Health Budget Reveals About Our Values",
    date: 'May 2, 2026',
    reads: 843,
    likes: 34
  }, {
    type: 'blog',
    title: 'Notes From My First Ambassador Trip',
    date: 'Apr 18, 2026',
    reads: 402,
    likes: 21
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 760,
      margin: '0 auto',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("section", {
    style: {
      borderRadius: 12,
      border: '1px solid var(--color-border)',
      background: '#fff',
      overflow: 'hidden',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      background: 'radial-gradient(circle at 18% 0%, rgba(16,185,129,0.14), transparent 38%), linear-gradient(135deg, #FFFFFF, #FAF8F5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      padding: '0 24px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: -44,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(UserAvatar, {
    name: "Gratitude Olanibi",
    size: 88
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      paddingTop: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      border: '1px solid var(--emerald-100)',
      background: 'var(--emerald-50)',
      color: 'var(--emerald-700)',
      fontSize: 12,
      fontWeight: 600,
      padding: '4px 10px'
    }
  }, "Verified Student"), /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      border: '1px solid var(--emerald-200)',
      background: 'var(--emerald-50)',
      color: 'var(--emerald-700)',
      fontSize: 12,
      fontWeight: 600,
      padding: '4px 10px'
    }
  }, "Open to opportunities")), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 28,
      fontWeight: 600,
      margin: 0,
      color: 'var(--text-ink)'
    }
  }, "Gratitude Olanibi \u2713"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '4px 0 0',
      fontSize: 13,
      color: 'var(--gray-500)'
    }
  }, "@gratitude234"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      fontSize: 14,
      lineHeight: 1.5,
      color: 'var(--gray-700)',
      maxWidth: 480
    }
  }, "Nursing Science student, builder & thinker. Writing on health systems, tech in Africa, and the quiet power of curiosity."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      fontSize: 13,
      color: 'var(--gray-500)'
    }
  }, "Jomo Kenyatta University / Nursing Science / Writing since 2024")), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'var(--brand-emerald)',
      color: '#fff',
      border: 'none',
      borderRadius: 10,
      padding: '9px 20px',
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer'
    }
  }, "Edit profile"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      borderTop: '1px solid var(--color-border-soft)',
      padding: '14px 8px'
    }
  }, stats.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.label,
    style: {
      flex: 1,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--text-ink)'
    }
  }, s.value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--text-ink-muted)',
      marginTop: 2
    }
  }, s.label))))), /*#__PURE__*/React.createElement("section", {
    style: {
      borderRadius: 12,
      border: '1px solid var(--color-border)',
      background: '#fff',
      padding: 20,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 4px',
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      color: 'var(--text-ink-muted)'
    }
  }, "Academic signal"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 18,
      fontWeight: 600,
      margin: '0 0 16px',
      color: 'var(--text-ink)'
    }
  }, "External proof points"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(PointsTierBadge, {
    points: 1240
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--text-ink-muted)'
    }
  }, "260 pts to Fellow")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--color-bg-page)',
      borderRadius: 10,
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 600
    }
  }, "12"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--gray-500)'
    }
  }, "Publications")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--color-bg-page)',
      borderRadius: 10,
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 600
    }
  }, "9"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--gray-500)'
    }
  }, "Reviewed work")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--color-bg-page)',
      borderRadius: 10,
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 600
    }
  }, "4"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--gray-500)'
    }
  }, "Citable work")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      borderBottom: '1px solid var(--color-border)',
      marginBottom: 16
    }
  }, ['Posts', 'Debates', 'Badges'].map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    onClick: () => setTab(t),
    style: {
      padding: '0 0 10px',
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      color: tab === t ? 'var(--brand-emerald)' : 'var(--gray-400)',
      borderBottom: tab === t ? '2px solid var(--brand-emerald)' : '2px solid transparent'
    }
  }, t))), tab === 'Posts' ? posts.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.title,
    style: {
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      background: '#fff',
      padding: 16,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    type: p.type
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 16,
      fontWeight: 600,
      margin: '8px 0 6px',
      color: 'var(--text-ink)'
    }
  }, p.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--text-ink-muted)',
      margin: 0
    }
  }, p.date, " \xB7 ", p.reads, " reads \xB7 ", p.likes, " likes"))) : /*#__PURE__*/React.createElement(window.IndegeniusDesignSystem_1274f6.EmptyState, {
    title: `No ${tab.toLowerCase()} yet.`,
    description: "This section will fill in as activity happens."
  }));
}
window.ProfileScreen = ProfileScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ProfileScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/LandingChrome.jsx
try { (() => {
// Shared nav + footer chrome for the marketing site.

function LandingNav() {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--brand-emerald)',
      padding: '6px 0',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.2em',
      color: 'var(--brand-gold)'
    }
  }, "Africa's intellectual social network")), /*#__PURE__*/React.createElement("nav", {
    style: {
      height: 60,
      borderBottom: '1px solid var(--color-border)',
      background: '#fff',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1240,
      margin: '0 auto',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 28,
      padding: '0 32px'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/indegenius-icon-wordmark-color.svg",
    alt: "Indegenius",
    style: {
      height: 28
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4,
      flex: 1
    }
  }, ['Home', 'Explore', 'Debates', 'Opportunities'].map(l => /*#__PURE__*/React.createElement("span", {
    key: l,
    style: {
      padding: '8px 12px',
      borderRadius: 8,
      fontSize: 13.5,
      fontWeight: 500,
      color: 'var(--text-ink-muted)'
    }
  }, l))), /*#__PURE__*/React.createElement("button", {
    style: {
      border: '1px solid var(--color-border)',
      background: '#fff',
      borderRadius: 10,
      padding: '8px 18px',
      fontSize: 13.5,
      fontWeight: 500,
      color: 'var(--gray-700)',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      flexShrink: 0
    }
  }, "Log in"), /*#__PURE__*/React.createElement("button", {
    style: {
      border: 'none',
      background: 'var(--brand-emerald)',
      color: '#fff',
      borderRadius: 10,
      padding: '8px 18px',
      fontSize: 13.5,
      fontWeight: 600,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      flexShrink: 0
    }
  }, "Claim your handle"))));
}
function LandingFooter() {
  const cols = [{
    title: 'Platform',
    items: ['Home', 'Explore', 'Write', 'Opportunities', 'Policy Hub', 'Debates']
  }, {
    title: 'Community',
    items: ['Editorial Standards', 'About Us']
  }, {
    title: 'Legal',
    items: ['Privacy Policy', 'Terms of Use']
  }];
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--surface-dark)',
      color: '#D1D5DB',
      padding: '48px 32px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1240,
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr',
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 700,
      color: 'var(--emerald-500)',
      marginBottom: 8
    }
  }, "Indegenius"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: '#9CA3AF',
      lineHeight: 1.5
    }
  }, "Where Africa's Ideas Connect")), cols.map(col => /*#__PURE__*/React.createElement("div", {
    key: col.title
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: '#fff',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: 14
    }
  }, col.title), col.items.map(it => /*#__PURE__*/React.createElement("div", {
    key: it,
    style: {
      fontSize: 13,
      color: '#9CA3AF',
      marginBottom: 8
    }
  }, it))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1240,
      margin: '32px auto 0',
      paddingTop: 20,
      borderTop: '1px solid #1F2937',
      textAlign: 'center',
      fontSize: 11,
      color: '#6B7280'
    }
  }, "\xA9 2026 Indegenius. Built for Africa."));
}
window.LandingNav = LandingNav;
window.LandingFooter = LandingFooter;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/LandingChrome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/LandingContent.jsx
try { (() => {
// Latest-posts grid + topic browser.

function LandingContent() {
  const posts = [{
    badge: 'Research',
    title: 'Mobile Money Adoption Among Rural Cooperatives in East Africa',
    excerpt: 'A field study across 40 savings groups in western Kenya finds mobile money cuts transaction costs but deepens exclusion for the unbanked elderly.',
    author: 'Kwame Boateng',
    uni: 'University of Ghana',
    date: '2d ago',
    wide: true
  }, {
    badge: 'Essay',
    title: 'The Hidden Cost of Studying Abroad',
    author: 'Ngozi Eze',
    uni: 'University of Lagos',
    date: '4d ago'
  }, {
    badge: 'Policy Brief',
    title: 'Reforming Fuel Subsidies Without Triggering Unrest',
    author: 'Fatima Diallo',
    uni: 'Cheikh Anta Diop University',
    date: '5d ago'
  }, {
    badge: 'Blog',
    title: 'What My First Year of Medical School Taught Me About Grief',
    author: 'Tendai Moyo',
    uni: 'University of Zimbabwe',
    date: '1w ago'
  }];
  const badgeStyle = {
    Blog: {
      bg: 'var(--type-blog-bg)',
      color: 'var(--type-blog)'
    },
    Essay: {
      bg: 'var(--type-essay-bg)',
      color: 'var(--type-essay)'
    },
    Research: {
      bg: 'var(--type-research-bg)',
      color: 'var(--type-research)'
    },
    'Policy Brief': {
      bg: 'var(--type-policy-bg)',
      color: 'var(--type-policy)'
    }
  };
  const stamp = {
    Blog: 'B',
    Essay: 'E',
    Research: 'R',
    'Policy Brief': 'P'
  };
  const gradient = {
    Blog: 'linear-gradient(135deg, var(--brand-emerald), #0E4B37)',
    Essay: 'linear-gradient(135deg, var(--brand-gold-ink), var(--brand-gold))',
    Research: 'linear-gradient(135deg, var(--brand-purple), #6B4A94)',
    'Policy Brief': 'linear-gradient(135deg, var(--brand-purple), #6B4A94)'
  };
  const topics = ['Policy', 'Health Systems', 'Technology', 'Climate', 'Education', 'Governance', 'Debates', 'Economics', 'Gender', 'Agriculture'];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: 1240,
      margin: '0 auto',
      padding: '64px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginBottom: 32
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      color: 'var(--text-ink-faint)',
      margin: '0 0 6px'
    }
  }, "Real work, real bylines"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 32,
      fontWeight: 500,
      margin: 0,
      color: 'var(--text-ink)'
    }
  }, "Latest from students")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--emerald-600)'
    }
  }, "Browse all \u2192")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '2fr 1fr 1fr',
      gap: 16
    }
  }, posts.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.title,
    style: {
      gridColumn: p.wide ? 'span 2' : 'span 1',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      overflow: 'hidden',
      background: '#fff',
      display: p.wide ? 'grid' : 'block',
      gridTemplateColumns: p.wide ? '240px 1fr' : undefined
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: p.wide ? 'auto' : 130,
      background: gradient[p.badge],
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
      padding: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: p.wide ? 80 : 44,
      fontWeight: 700,
      color: 'rgba(255,255,255,0.16)',
      lineHeight: 1
    }
  }, stamp[p.badge])), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: p.wide ? '20px 24px' : 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      borderRadius: 999,
      padding: '2px 10px',
      fontSize: 11,
      fontWeight: 500,
      marginBottom: 10,
      ...badgeStyle[p.badge]
    }
  }, p.badge), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: p.wide ? 20 : 16,
      fontWeight: 600,
      margin: '0 0 8px',
      color: 'var(--text-ink)',
      lineHeight: 1.3
    }
  }, p.title), p.excerpt ? /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--text-ink-muted)',
      lineHeight: 1.5,
      margin: '0 0 12px'
    }
  }, p.excerpt) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      borderTop: '1px solid var(--color-border-soft)',
      paddingTop: 10,
      fontSize: 12,
      color: 'var(--text-ink-faint)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500,
      color: 'var(--gray-700)'
    }
  }, p.author), /*#__PURE__*/React.createElement("span", null, "\xB7 ", p.uni), /*#__PURE__*/React.createElement("span", null, "\xB7 ", p.date))))))), /*#__PURE__*/React.createElement("section", {
    style: {
      borderTop: '1px solid var(--color-border)',
      borderBottom: '1px solid var(--color-border)',
      background: '#fff',
      padding: '48px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1240,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      color: 'var(--text-ink-faint)',
      margin: '0 0 6px'
    }
  }, "Browse by topic"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 26,
      fontWeight: 500,
      margin: '0 0 24px',
      color: 'var(--text-ink)'
    }
  }, "Find ideas that interest you"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10
    }
  }, topics.map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      border: '1px solid var(--color-border)',
      borderRadius: 999,
      padding: '7px 16px',
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--gray-700)'
    }
  }, t, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-ink-faint)',
      fontSize: 11
    }
  }, Math.ceil(Math.random() * 90) + 10)))))));
}
window.LandingContent = LandingContent;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/LandingContent.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/LandingDebates.jsx
try { (() => {
// Debates teaser section + value props + dual CTA.

function LandingDebates() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      borderBottom: '1px solid var(--color-border)',
      background: '#fff',
      padding: '80px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1240,
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 64,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--amber-500)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      color: 'var(--amber-700)'
    }
  }, "Live feature")), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 40,
      fontWeight: 500,
      lineHeight: 1.1,
      margin: '0 0 16px',
      color: 'var(--text-ink)'
    }
  }, "Argue the motion.", /*#__PURE__*/React.createElement("br", null), "Move the debate."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      lineHeight: 1.7,
      color: 'var(--text-ink-muted)',
      maxWidth: 420,
      margin: '0 0 28px'
    }
  }, "Structured academic debates run in live rounds. Make your argument for or against, have it upvoted by readers, and engage with counterpoints in real time."), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'var(--brand-emerald)',
      color: '#fff',
      border: 'none',
      borderRadius: 10,
      padding: '12px 24px',
      fontSize: 15,
      fontWeight: 500,
      cursor: 'pointer'
    }
  }, "View active debates")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 12,
      background: 'var(--color-bg-page)',
      border: '1px solid var(--color-border)',
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--brand-emerald)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.15em',
      color: 'var(--emerald-600)'
    }
  }, "Active \xB7 142 arguments")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 18,
      fontWeight: 600,
      margin: '0 0 12px',
      color: 'var(--text-ink)'
    }
  }, "Should African universities adopt English-only instruction policies?"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: 5,
      borderRadius: 999,
      overflow: 'hidden',
      background: 'var(--gray-100)',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '58%',
      background: 'var(--stance-for)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '42%',
      background: 'var(--stance-against)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 11,
      fontWeight: 500,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--emerald-600)'
    }
  }, "For \xB7 58%"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--purple-600)'
    }
  }, "Against \xB7 42%")), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'var(--brand-emerald)',
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      padding: '6px 14px',
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer'
    }
  }, "Join debate")), /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 12,
      background: 'var(--color-bg-page)',
      border: '1px solid var(--color-border)',
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--amber-500)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.15em',
      color: 'var(--amber-700)'
    }
  }, "Open for arguments")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 18,
      fontWeight: 600,
      margin: '0 0 8px',
      color: 'var(--text-ink)'
    }
  }, "Is IMF conditionality still a legitimate development tool in Africa?"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--text-ink-muted)',
      margin: 0
    }
  }, "Opening round \xB7 submissions open this week")))));
}
function LandingValueProps() {
  const items = [{
    num: '01',
    bg: 'var(--emerald-100)',
    color: 'var(--emerald-600)',
    title: 'Find serious student ideas',
    desc: 'Read essays, research, and policy briefs from students writing beyond the quick-take feed — with real citations, arguments, and bylines.'
  }, {
    num: '02',
    bg: 'var(--amber-100)',
    color: 'var(--amber-700)',
    title: 'Follow credible writers',
    desc: 'Author profiles show university, field of study, peer-review history, and point tier — so you can decide whose work is worth tracking.'
  }, {
    num: '03',
    bg: 'var(--purple-100)',
    color: 'var(--purple-700)',
    title: 'Respond thoughtfully',
    desc: 'Move from reading into questions, counterpoints, and response posts — or join a structured debate and have your argument evaluated by peers.'
  }];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      borderBottom: '1px solid var(--color-border)',
      background: '#fff',
      padding: '56px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1240,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginBottom: 48
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.16em',
      color: 'var(--gray-600)',
      margin: '0 0 8px'
    }
  }, "How it works"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 30,
      fontWeight: 500,
      margin: 0,
      color: 'var(--text-ink)'
    }
  }, "Built for intellectual seriousness")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 0
    }
  }, items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: it.num,
    style: {
      padding: '0 40px',
      borderLeft: i > 0 ? '1px solid var(--color-border)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 12,
      background: it.bg,
      color: it.color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 28,
      fontWeight: 700
    }
  }, it.num)), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 18,
      fontWeight: 600,
      margin: '0 0 10px',
      color: 'var(--text-ink)'
    }
  }, it.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      lineHeight: 1.7,
      color: 'var(--text-ink-muted)',
      margin: 0
    }
  }, it.desc))))));
}
function LandingDualCTA() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: 1240,
      margin: '0 auto',
      padding: '64px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 16,
      background: 'var(--surface-dark)',
      color: '#fff',
      padding: '44px 40px'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      opacity: 0.65,
      margin: '0 0 14px'
    }
  }, "For readers"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 30,
      fontWeight: 500,
      lineHeight: 1.1,
      margin: '0 0 12px'
    }
  }, "Start exploring student ideas today"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      lineHeight: 1.6,
      opacity: 0.8,
      margin: '0 0 28px'
    }
  }, "No account needed to read. Browse essays, research, and policy briefs from students at 142 African universities."), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'var(--brand-emerald)',
      color: '#fff',
      border: 'none',
      borderRadius: 10,
      padding: '12px 28px',
      fontSize: 15,
      fontWeight: 500,
      cursor: 'pointer'
    }
  }, "Browse as guest \u2192")), /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 16,
      background: 'var(--brand-emerald)',
      color: '#fff',
      padding: '44px 40px'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      opacity: 0.65,
      margin: '0 0 14px'
    }
  }, "For writers"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 30,
      fontWeight: 500,
      lineHeight: 1.1,
      margin: '0 0 12px'
    }
  }, "Publish your research and build your profile"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      lineHeight: 1.6,
      opacity: 0.8,
      margin: '0 0 28px'
    }
  }, "Claim your handle, complete your student profile, and start with a Quick Take. Essays and research papers earn points toward your Scholar tier."), /*#__PURE__*/React.createElement("button", {
    style: {
      background: '#fff',
      color: 'var(--emerald-600)',
      border: 'none',
      borderRadius: 10,
      padding: '12px 28px',
      fontSize: 15,
      fontWeight: 500,
      cursor: 'pointer'
    }
  }, "Claim your handle \u2192"))));
}
window.LandingDebates = LandingDebates;
window.LandingValueProps = LandingValueProps;
window.LandingDualCTA = LandingDualCTA;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/LandingDebates.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/LandingHero.jsx
try { (() => {
// Hero section: headline + CTAs + social proof + reading rail, and the stats bar beneath it.

function LandingHero() {
  const railPosts = [{
    badge: 'Essay',
    title: 'Why African Universities Must Decolonise the Curriculum',
    author: 'Amina Coulibaly',
    uni: 'University of Ibadan'
  }, {
    badge: 'Research',
    title: 'Mobile Money Adoption Among Rural Cooperatives in East Africa',
    author: 'Kwame Boateng',
    uni: 'University of Ghana'
  }, {
    badge: 'Policy Brief',
    title: 'Reforming Fuel Subsidies Without Triggering Unrest',
    author: 'Fatima Diallo',
    uni: 'Cheikh Anta Diop University'
  }];
  const badgeStyle = {
    blog: {
      bg: 'var(--type-blog-bg)',
      color: 'var(--type-blog)'
    },
    Essay: {
      bg: 'var(--type-essay-bg)',
      color: 'var(--type-essay)'
    },
    Research: {
      bg: 'var(--type-research-bg)',
      color: 'var(--type-research)'
    },
    'Policy Brief': {
      bg: 'var(--type-policy-bg)',
      color: 'var(--type-policy)'
    }
  };
  return /*#__PURE__*/React.createElement("section", {
    style: {
      borderBottom: '1px solid var(--color-border)',
      padding: '64px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1240,
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: '1fr 440px',
      gap: 64,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--brand-emerald)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      color: 'var(--emerald-600)'
    }
  }, "Africa's intellectual social network")), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 64,
      lineHeight: 1.02,
      margin: '0 0 24px',
      color: 'var(--text-ink)'
    }
  }, "Where Africa's", /*#__PURE__*/React.createElement("br", null), "best student", /*#__PURE__*/React.createElement("br", null), "ideas ", /*#__PURE__*/React.createElement("em", {
    style: {
      color: 'var(--emerald-500)',
      fontStyle: 'normal'
    }
  }, "live.")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 18,
      lineHeight: 1.65,
      color: 'var(--text-ink-muted)',
      maxWidth: 480,
      margin: '0 0 36px'
    }
  }, "Essays, research, and policy briefs written by university students across Africa, rigorously argued and openly published."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginBottom: 32
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'var(--brand-emerald)',
      color: '#fff',
      border: 'none',
      borderRadius: 12,
      padding: '14px 28px',
      fontSize: 16,
      fontWeight: 500,
      cursor: 'pointer'
    }
  }, "Start reading \u2192"), /*#__PURE__*/React.createElement("button", {
    style: {
      background: '#fff',
      color: 'var(--gray-700)',
      border: '1px solid var(--gray-300)',
      borderRadius: 12,
      padding: '14px 28px',
      fontSize: 16,
      fontWeight: 500,
      cursor: 'pointer'
    }
  }, "Claim your handle")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex'
    }
  }, [['A', 'var(--emerald-100)', 'var(--emerald-700)'], ['K', 'var(--purple-100)', 'var(--purple-700)'], ['F', 'var(--amber-100)', 'var(--amber-700)'], ['N', 'var(--blue-100)', 'var(--blue-600)']].map(([i, bg, color], idx) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      width: 30,
      height: 30,
      borderRadius: '50%',
      border: '2px solid #fff',
      background: bg,
      color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 600,
      marginLeft: idx > 0 ? -8 : 0
    }
  }, i))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--text-ink-muted)'
    }
  }, "Join ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--text-ink)'
    }
  }, "2,400"), " students already publishing"))), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid var(--color-border)',
      borderRadius: 16,
      background: '#fff',
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '0 4px',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--text-ink)'
    }
  }, "Start reading"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--emerald-600)'
    }
  }, "Browse all \u2192")), railPosts.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: p.title,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      borderRadius: 10,
      border: '1px solid var(--color-border)',
      background: i === 0 ? '#fff' : 'var(--color-bg-page)',
      padding: '10px 12px',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flexShrink: 0,
      borderRadius: 999,
      padding: '2px 10px',
      fontSize: 11,
      fontWeight: 500,
      ...badgeStyle[p.badge]
    }
  }, p.badge), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--text-ink)',
      lineHeight: 1.3
    }
  }, p.title), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '2px 0 0',
      fontSize: 11,
      color: 'var(--text-ink-muted)'
    }
  }, p.author, " \xB7 ", p.uni)))))));
}
function LandingStats() {
  const stats = [{
    value: '2,400',
    label: 'Student writers'
  }, {
    value: '6,180',
    label: 'Published posts'
  }, {
    value: '142',
    label: 'Universities represented'
  }, {
    value: '38',
    label: 'African countries'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderBottom: '1px solid var(--color-border)',
      background: '#fff',
      padding: '18px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1240,
      margin: '0 auto',
      display: 'flex',
      justifyContent: 'center',
      gap: 0
    }
  }, stats.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.label,
    style: {
      padding: '4px 40px',
      textAlign: 'center',
      borderLeft: i > 0 ? '1px solid var(--color-border)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 30,
      fontWeight: 700,
      color: 'var(--text-ink)'
    }
  }, s.value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--gray-500)',
      marginTop: 4,
      maxWidth: 144
    }
  }, s.label)))));
}
window.LandingHero = LandingHero;
window.LandingStats = LandingStats;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/LandingHero.jsx", error: String((e && e.message) || e) }); }

__ds_ns.FollowButton = __ds_scope.FollowButton;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Pill = __ds_scope.Pill;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.PointsTierBadge = __ds_scope.PointsTierBadge;

__ds_ns.UserAvatar = __ds_scope.UserAvatar;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.SkeletonCard = __ds_scope.SkeletonCard;

__ds_ns.Toast = __ds_scope.Toast;

})();
