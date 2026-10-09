import "@/components/profile/profile.css";
import { PROFILE_SHELL } from "@/lib/profileLayout";

function Placeholder({ className }: { className: string }) {
  return <div className={`rounded bg-card-border ${className}`} />;
}

/** Shares the overview's layout classes so loading follows the same breakpoints. */
export default function Loading() {
  return (
    <div
      className={`${PROFILE_SHELL} animate-pulse motion-reduce:animate-none`}
      role="status"
      aria-label="Loading this profile"
    >
      <div className="profile-page-grid" aria-hidden="true">
        <div className="profile-primary">
          <div className="profile-identity has-cover">
            <div className="profile-cover">
              <Placeholder className="h-full w-full" />
            </div>
            <div className="profile-identity-top">
              <div className="profile-identity-person">
                <Placeholder className="profile-avatar shrink-0 rounded-full" />
                <div className="min-w-0">
                  <div className="profile-name">
                    <Placeholder className="h-[1.15em] w-52 max-w-full" />
                  </div>
                  <Placeholder className="mt-1 h-5 w-28 max-w-full" />
                  <div className="profile-headline">
                    <Placeholder className="h-[1.5em] w-64 max-w-full" />
                  </div>
                </div>
              </div>
              <div className="profile-header-actions">
                <Placeholder className="h-11 w-28 rounded-lg" />
                <Placeholder className="h-11 w-11 rounded-lg" />
                <Placeholder className="h-11 w-11 rounded-lg" />
              </div>
            </div>
            <div className="profile-location">
              <Placeholder className="h-5 w-28" />
            </div>
            <div className="profile-bio space-y-2">
              <Placeholder className="h-4 w-full" />
              <Placeholder className="h-4 w-3/4" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Placeholder className="h-9 w-24" />
              <Placeholder className="h-9 w-24" />
            </div>
          </div>

          <div className="profile-tabs">
            {[0, 1, 2, 3].map((tab) => (
              <div key={tab} className="profile-tab">
                <Placeholder className="h-5 w-16" />
              </div>
            ))}
          </div>

          <div className="profile-panel profile-panel-overview">
            <div className="profile-overview-content">
              <div className="profile-overview-main">
                <div className="profile-selected-work">
                  <div className="profile-work-kicker">
                    <Placeholder className="h-4 w-28" />
                  </div>
                  <div className="profile-selected-work-inner">
                    <div className="profile-work-content">
                      <div className="profile-selected-heading has-media">
                        <div className="profile-selected-cover">
                          <Placeholder className="h-full w-full" />
                        </div>
                        <div className="min-w-0">
                          <div className="profile-selected-kind">
                            <Placeholder className="h-4 w-16" />
                          </div>
                          <div className="profile-selected-title">
                            <Placeholder className="h-[1.18em] w-3/4" />
                          </div>
                        </div>
                      </div>
                      <div className="profile-selected-excerpt space-y-2">
                        <Placeholder className="h-4 w-full" />
                        <Placeholder className="h-4 w-4/5" />
                      </div>
                      <div className="profile-publication-meta">
                        <Placeholder className="h-4 w-32" />
                      </div>
                      <div className="profile-selected-footer">
                        <Placeholder className="h-11 w-28" />
                        <div className="profile-work-actions">
                          <Placeholder className="h-11 w-52 max-w-full" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="profile-section profile-recent-section">
                  <div className="profile-section-title">
                    <Placeholder className="h-[1.3em] w-32" />
                  </div>
                  <div className="profile-recent-work">
                    {[0, 1, 2].map((row) => (
                      <div key={row} className="profile-recent-item">
                        <div className="min-w-0 flex-1 space-y-2">
                          <Placeholder className="h-4 w-14" />
                          <Placeholder className="h-6 w-3/4" />
                          <Placeholder className="h-4 w-full" />
                          <Placeholder className="h-3 w-24" />
                          <Placeholder className="h-11 w-52 max-w-full" />
                        </div>
                        <div className="profile-recent-cover">
                          <Placeholder className="h-full w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="profile-record">
                  <div className="profile-section-heading">
                    <div className="min-w-0">
                      <div className="profile-section-title">
                        <Placeholder className="h-[1.3em] w-52 max-w-full" />
                      </div>
                      <div className="profile-section-note">
                        <Placeholder className="h-4 w-56 max-w-full" />
                      </div>
                    </div>
                    <Placeholder className="h-9 w-28 max-w-full" />
                  </div>
                  <dl className="profile-record-metrics">
                    {[0, 1, 2].map((metric) => (
                      <div key={metric}>
                        <dt className="min-w-0">
                          <Placeholder className="h-[1.35em] w-20 max-w-full" />
                        </dt>
                        <dd className="min-w-0">
                          <Placeholder className="h-[1em] w-14 max-w-full" />
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <details className="profile-activity">
                    <summary className="profile-activity-toggle">
                      <Placeholder className="h-5 w-32" />
                    </summary>
                    <div className="profile-activity-heading">
                      <Placeholder className="h-4 w-24 max-w-full" />
                      <Placeholder className="h-4 w-36 max-w-full" />
                    </div>
                    <ol className="profile-activity-chart">
                      {Array.from({ length: 12 }, (_, month) => (
                        <li key={month}>
                          <div className="profile-activity-point">
                            <Placeholder className="h-10 w-full max-w-[26px] justify-self-center" />
                            <Placeholder className="h-2 w-4 max-w-full justify-self-center" />
                          </div>
                        </li>
                      ))}
                    </ol>
                    <div className="profile-activity-value">
                      <Placeholder className="h-5 w-56 max-w-full" />
                    </div>
                  </details>
                  <div className="profile-record-links">
                    <Placeholder className="h-9 w-20" />
                    <Placeholder className="h-9 w-24" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="profile-overview-aside">
          <div className="profile-aside-section profile-aside-details space-y-3">
            <Placeholder className="h-6 w-16" />
            <div className="profile-aside-facts">
              {[0, 1, 2].map((fact) => (
                <div key={fact} className="space-y-2">
                  <Placeholder className="h-3 w-16" />
                  <Placeholder className="h-4 w-3/4" />
                </div>
              ))}
            </div>
            <Placeholder className="h-9 w-28" />
          </div>
          {[0, 1].map((section) => (
            <div key={section} className="profile-aside-section space-y-3">
              <Placeholder className="h-6 w-24" />
              <Placeholder className="h-4 w-32 max-w-full" />
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3].map((chip) => (
                  <Placeholder key={chip} className="h-8 w-20 rounded-full" />
                ))}
              </div>
            </div>
          ))}
        </aside>
      </div>

      <span className="sr-only">Loading this profile...</span>
    </div>
  );
}
