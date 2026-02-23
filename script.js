document.addEventListener("DOMContentLoaded", () => {
  const appView = document.getElementById("app-view");
  const navLinks = document.querySelectorAll(".nav-link, .mobile-nav-link");
  const mobileMenuToggle = document.querySelector(".mobile-menu-toggle");
  const mobileNavOverlay = document.querySelector(".mobile-nav-overlay");

  // --- Data & State Management ---
  let savedJobIds = JSON.parse(localStorage.getItem("savedJobs")) || [];
  let jobTrackerStatus = JSON.parse(localStorage.getItem("jobTrackerStatus")) || {};
  let userPrefs = JSON.parse(localStorage.getItem("jobTrackerPreferences")) || null;
  let testChecklist = JSON.parse(localStorage.getItem("jobTrackerTestChecklist")) || {};
  let artifactLinks = JSON.parse(localStorage.getItem("jobTrackerArtifactLinks")) || {
    lovable: '',
    github: '',
    deployed: ''
  };
  let isShipped = JSON.parse(localStorage.getItem("jobTrackerShipped")) || false;

  const saveToStore = () => {
    localStorage.setItem("savedJobs", JSON.stringify(savedJobIds));
    localStorage.setItem("jobTrackerStatus", JSON.stringify(jobTrackerStatus));
    localStorage.setItem("jobTrackerTestChecklist", JSON.stringify(testChecklist));
    localStorage.setItem("jobTrackerArtifactLinks", JSON.stringify(artifactLinks));
    localStorage.setItem("jobTrackerShipped", JSON.stringify(isShipped));
  };

  const savePreferences = (prefs) => {
    localStorage.setItem("jobTrackerPreferences", JSON.stringify(prefs));
    userPrefs = prefs;
  };

  const calculateMatchScore = (job) => {
    if (!userPrefs) return 0;
    let score = 0;
    const { roleKeywords, preferredLocations, preferredModes, experienceLevel, skills } = userPrefs;

    // roleKeywords (+25 title, +15 description)
    if (roleKeywords) {
      const keywords = roleKeywords.split(",").map(k => k.trim().toLowerCase());
      if (keywords.some(k => job.title.toLowerCase().includes(k))) score += 25;
      if (keywords.some(k => job.description.toLowerCase().includes(k))) score += 15;
    }

    // location (+15)
    if (preferredLocations && preferredLocations.includes(job.location)) score += 15;

    // mode (+10)
    if (preferredModes && preferredModes.includes(job.mode)) score += 10;

    // experience (+10)
    if (experienceLevel && job.experience === experienceLevel) score += 10;

    // skills (+15)
    if (skills) {
      const userSkills = skills.split(",").map(k => k.trim().toLowerCase());
      if (job.skills.some(s => userSkills.includes(s.toLowerCase()))) score += 15;
    }

    // recency (+5)
    if (job.postedDaysAgo <= 2) score += 5;

    // source (+5)
    if (job.source === "LinkedIn") score += 5;

    return Math.min(100, score);
  };

  const createJobCard = (job) => {
    const isSaved = savedJobIds.includes(job.id);
    const score = calculateMatchScore(job);
    const statusData = jobTrackerStatus[job.id] || { status: 'not_applied' };
    const status = statusData.status;

    let scoreClass = "match-badge--none";
    if (userPrefs) {
      if (score >= 80) scoreClass = "match-badge--high";
      else if (score >= 60) scoreClass = "match-badge--mid";
      else if (score >= 40) scoreClass = "match-badge--low";
    }

    return `
      <div class="job-card" data-job-id="${job.id}">
        <span class="job-card__source">${job.source}</span>
        <div class="job-card__header">
          <div class="job-card__title-group">
            <h3 class="job-card__title">${job.title}</h3>
            <div class="job-card__badges">
              ${userPrefs ? `<div class="match-badge ${scoreClass}">${score}% MATCH</div>` : ""}
              <span class="status-badge status-badge--${status}">${status.replace('_', ' ')}</span>
            </div>
          </div>
          <span class="job-card__company">${job.company}</span>
        </div>
        <div class="job-card__meta">
          <span class="job-card__info">${job.location} • ${job.mode}</span>
          <span class="job-card__info">${job.experience}</span>
        </div>
        <div class="job-card__salary">${job.salaryRange}</div>
        <div class="job-card__footer">
          <div class="job-card__actions">
            <button class="btn btn--secondary btn--sm view-job-btn" data-id="${job.id}">View</button>
            <button class="btn btn--secondary btn--sm save-job-btn ${isSaved ? 'active' : ''}" data-id="${job.id}">
              ${isSaved ? 'Saved' : 'Save'}
            </button>
          </div>
          <div class="status-control">
            <select class="status-select" data-id="${job.id}">
              <option value="not_applied" ${status === 'not_applied' ? 'selected' : ''}>Not Applied</option>
              <option value="applied" ${status === 'applied' ? 'selected' : ''}>Applied</option>
              <option value="rejected" ${status === 'rejected' ? 'selected' : ''}>Rejected</option>
              <option value="selected" ${status === 'selected' ? 'selected' : ''}>Selected</option>
            </select>
          </div>
        </div>
        <div class="job-card__time">${job.postedDaysAgo === 0 ? 'Today' : job.postedDaysAgo + ' days ago'}</div>
      </div>
    `;
  };

  const renderJobsList = (container, jobs) => {
    if (!container) return;
    if (jobs.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1">
          <p class="empty-state__text">No opportunities found matching these criteria.</p>
        </div>
      `;
      return;
    }
    const jobCountEl = document.getElementById("jobCount");
    if (jobCountEl) jobCountEl.textContent = jobs.length;

    container.innerHTML = jobs.map(createJobCard).join("");
  };

  // --- Daily Digest Engine ---
  const generateDigest = () => {
    const today = new Array(new Date()).map(d => d.toISOString().split("T")[0])[0];
    const key = `jobTrackerDigest_${today}`;

    // Calculate scores for all jobs
    const scoredJobs = JOBS_DATA.map(j => ({
      ...j,
      matchScore: calculateMatchScore(j)
    }));

    // Filter and Sort: Top 10 by matchScore (desc) then postedDaysAgo (asc)
    const digestJobs = scoredJobs
      .filter(j => j.matchScore > 0)
      .sort((a, b) => (b.matchScore - a.matchScore) || (a.postedDaysAgo - b.postedDaysAgo))
      .slice(0, 10);

    localStorage.setItem(key, JSON.stringify(digestJobs));
    renderDigestView();
  };

  const renderDigestView = () => {
    const generator = document.getElementById("digestGenerator");
    const content = document.getElementById("digestContent");
    const noPrefs = document.getElementById("digestNoPrefs");
    const body = document.getElementById("digestBody");

    if (!generator || !content || !noPrefs || !body) return;

    // Reset visibility
    [generator, content, noPrefs].forEach(el => el.classList.add("hidden"));

    if (!userPrefs) {
      noPrefs.classList.remove("hidden");
      return;
    }

    const today = new Array(new Date()).map(d => d.toISOString().split("T")[0])[0];
    const key = `jobTrackerDigest_${today}`;
    const digest = JSON.parse(localStorage.getItem(key));

    if (!digest) {
      generator.classList.remove("hidden");
    } else if (digest.length === 0) {
      body.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__text">No matching roles today. Check again tomorrow.</p>
        </div>
      `;
      content.classList.remove("hidden");
    } else {
      const dateStr = new Date().toLocaleDateString("en-US", { month: 'long', day: 'numeric', year: 'numeric' });

      body.innerHTML = `
        <div class="digest-header">
          <h2 class="digest-header__title">Top ${digest.length} Jobs For You — 9AM Digest</h2>
          <div class="digest-header__date">${dateStr}</div>
        </div>
        <div class="digest-list">
          ${digest.map(job => `
            <div class="digest-item">
              <div class="digest-item__header">
                <h3 class="digest-item__title">${job.title}</h3>
                <span class="digest-item__score">${job.matchScore}% MATCH</span>
              </div>
              <div class="digest-item__company">${job.company}</div>
              <div class="digest-item__meta">${job.location} • ${job.experience}</div>
              <div class="job-card__footer" style="margin-top: 12px; padding:0; border:0;">
                <a href="${job.applyUrl}" target="_blank" class="btn btn--primary btn--sm">Apply Now</a>
              </div>
            </div>
          `).join("")}
        </div>
        <div class="digest-footer">
          This digest was generated based on your preferences.
        </div>
      `;
      content.classList.remove("hidden");
    }

    // Render Recent Updates
    const updatesSection = document.getElementById("recentUpdatesSection");
    const updatesList = document.getElementById("recentUpdatesList");

    if (updatesList && updatesSection) {
      const updates = Object.entries(jobTrackerStatus)
        .map(([id, data]) => {
          const job = JOBS_DATA.find(j => j.id == parseInt(id));
          return { ...job, ...data };
        })
        .filter(u => u && u.status !== 'not_applied')
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 5);

      if (updates.length > 0) {
        updatesSection.classList.remove("hidden");
        updatesList.innerHTML = updates.map(u => `
          <div class="digest-item">
            <div class="digest-item__header">
              <h3 class="digest-item__title">${u.title}</h3>
              <span class="status-badge status-badge--${u.status}">${u.status.replace('_', ' ')}</span>
            </div>
            <div class="digest-item__company">${u.company}</div>
            <div class="digest-item__meta">Updated on ${new Date(u.updatedAt).toLocaleDateString()}</div>
          </div>
        `).join("");
      } else {
        updatesSection.classList.add("hidden");
      }
    }
  };

  // --- Filtering & Sorting ---
  const applyFilters = () => {
    const keyword = document.getElementById("keywordSearch")?.value.toLowerCase() || "";
    const loc = document.getElementById("locationFilter")?.value || "";
    const mode = document.getElementById("modeFilter")?.value || "";
    const exp = document.getElementById("experienceFilter")?.value || "";
    const source = document.getElementById("sourceFilter")?.value || "";
    const status = document.getElementById("statusFilter")?.value || "";
    const sort = document.getElementById("sortOrder")?.value || "latest";
    const onlyMatches = document.getElementById("thresholdToggle")?.checked || false;

    // Update banner visibility
    const banner = document.getElementById("prefsBanner");
    if (banner) banner.classList.toggle("hidden", !!userPrefs);

    let filtered = JOBS_DATA.filter(job => {
      const matchKeyword = job.title.toLowerCase().includes(keyword) || job.company.toLowerCase().includes(keyword);
      const matchLoc = !loc || job.location === loc;
      const matchMode = !mode || job.mode === mode;
      const matchExp = !exp || job.experience === exp;
      const matchSource = !source || job.source === source;

      const itemStatus = jobTrackerStatus[job.id]?.status || 'not_applied';
      const matchStatus = !status || itemStatus === status;

      let matchThreshold = true;
      if (onlyMatches && userPrefs) {
        matchThreshold = calculateMatchScore(job) >= (userPrefs.minMatchScore || 40);
      }

      return matchKeyword && matchLoc && matchMode && matchExp && matchSource && matchStatus && matchThreshold;
    });

    if (sort === "latest") {
      filtered.sort((a, b) => a.postedDaysAgo - b.postedDaysAgo);
    } else if (sort === "oldest") {
      filtered.sort((a, b) => b.postedDaysAgo - a.postedDaysAgo);
    } else if (sort === "match") {
      filtered.sort((a, b) => calculateMatchScore(b) - calculateMatchScore(a));
    } else if (sort === "salary") {
      filtered.sort((a, b) => {
        const getVal = (s) => {
          const m = s.match(/(\d+)/);
          return m ? parseInt(m[0]) : 0;
        };
        return getVal(b.salaryRange) - getVal(a.salaryRange);
      });
    }

    renderJobsList(document.getElementById("jobsList"), filtered);
  };

  const showToast = (message) => {
    let container = document.querySelector(".toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  // --- Routing Logic ---
  const routes = {
    home: "template-home",
    dashboard: "template-dashboard",
    saved: "template-saved",
    digest: "template-digest",
    settings: "template-settings",
    proof: "template-proof", // /jt/07-test
    ship: "template-ship"    // /jt/08-ship
  };

  const TEST_ITEMS = [
    { id: 'prefs_persist', label: 'Preferences persist after refresh', desc: 'Save settings, refresh, and check if they remain.' },
    { id: 'score_calc', label: 'Match score calculates correctly', desc: 'Verify role keywords/location add up as expected.' },
    { id: 'toggle_works', label: '"Show only matches" toggle works', desc: 'Toggle dashboard switch and see low scores disappear.' },
    { id: 'save_persist', label: 'Save job persists after refresh', desc: 'Save a role and verify it stays in Saved tab.' },
    { id: 'apply_tab', label: 'Apply opens in new tab', desc: 'Click apply and verify a new window opens.' },
    { id: 'status_persist', label: 'Status update persists after refresh', desc: 'Change status to Applied and refresh.' },
    { id: 'filter_works', label: 'Status filter works correctly', desc: 'Select Applied in filter and see only those jobs.' },
    { id: 'digest_score', label: 'Digest generates top 10 by score', desc: 'Verify digest order follows match score logic.' },
    { id: 'digest_persist', label: 'Digest persists for the day', desc: 'Generate digest and see it remains on return.' },
    { id: 'no_errors', label: 'No console errors on main pages', desc: 'Open F12 and verify the console is clean.' }
  ];

  const PROJECT_STEPS = [
    { id: 'design', label: 'Core Design System' },
    { id: 'layout', label: 'Responsive Layout' },
    { id: 'dashboard', label: 'Job Dashboard' },
    { id: 'filtering', label: 'Filtering System' },
    { id: 'matching', label: 'Match Scoring' },
    { id: 'digest', label: 'Daily Digest' },
    { id: 'modal', label: 'Detail Modal' },
    { id: 'checklist', label: 'Test Checklist' }
  ];

  const checkStepStatus = (id) => {
    switch (id) {
      case 'design': return true; // Always done
      case 'layout': return true; // Always done
      case 'dashboard': return JOBS_DATA.length > 0;
      case 'filtering': return true; // logic exists
      case 'matching': return userPrefs !== null;
      case 'digest':
        const today = new Array(new Date()).map(d => d.toISOString().split("T")[0])[0];
        return localStorage.getItem(`jobTrackerDigest_${today}`) !== null;
      case 'modal': return true; // component exists
      case 'checklist': return TEST_ITEMS.filter(item => testChecklist[item.id]).length === 10;
      default: return false;
    }
  };

  const renderProofView = () => {
    const stepsGrid = document.getElementById("stepsSummary");
    if (stepsGrid) {
      stepsGrid.innerHTML = PROJECT_STEPS.map(step => {
        const completed = checkStepStatus(step.id);
        return `
          <div class="step-item ${completed ? 'step-item--completed' : 'step-item--pending'}">
            <span class="step-item__icon">${completed ? '✓' : '!'}</span>
            <span class="step-item__label">${step.label}</span>
          </div>
        `;
      }).join("");
    }

    // Prefill Artifact Links
    const lovableInput = document.getElementById("lovableLink");
    const githubInput = document.getElementById("githubLink");
    const deployedInput = document.getElementById("deployedUrl");

    if (lovableInput) lovableInput.value = artifactLinks.lovable || "";
    if (githubInput) githubInput.value = artifactLinks.github || "";
    if (deployedInput) deployedInput.value = artifactLinks.deployed || "";

    // Show completion message if shipped
    const shipMsg = document.getElementById("shipSuccessMsg");
    if (shipMsg) shipMsg.classList.toggle("hidden", !isShipped);

    renderTestChecklist();
  };

  const renderTestChecklist = () => {
    const list = document.getElementById("testChecklist");
    const countEl = document.getElementById("testCount");
    if (!list) return;

    const completed = TEST_ITEMS.filter(item => testChecklist[item.id]).length;
    if (countEl) countEl.textContent = `Tests Passed: ${completed} / ${TEST_ITEMS.length}`;

    // Force visibility and enough space for all 10 items
    list.style.display = "block";
    list.style.maxHeight = "none";
    list.style.overflow = "visible";

    list.innerHTML = TEST_ITEMS.map(item => `
      <div class="checklist-item" style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 4px;">
        <input type="checkbox" id="chk_${item.id}" class="test-chk" data-id="${item.id}" ${testChecklist[item.id] ? 'checked' : ''} style="margin-top: 4px; width: 18px; height: 18px; cursor: pointer;">
        <label for="chk_${item.id}" class="checklist-item__label" style="font-size: 13px; cursor: pointer; line-height: 1.5; color: #333;">
          <strong>${item.label}</strong><br>
          <span style="font-size: 11px; opacity: 0.7;">${item.desc || ''}</span>
        </label>
      </div>
    `).join("");

    updateHeaderBadge();
  };

  const updateHeaderBadge = () => {
    const headerBadge = document.querySelector(".top-bar__right .status-badge");
    if (!headerBadge) return;

    const completedTests = TEST_ITEMS.filter(item => testChecklist[item.id]).length;
    const linksProvided = artifactLinks.lovable && artifactLinks.github && artifactLinks.deployed;

    if (isShipped) {
      headerBadge.textContent = "SHIPPED";
      headerBadge.className = "status-badge status-badge--success";
    } else if (completedTests === 10 && linksProvided) {
      headerBadge.textContent = "READY";
      headerBadge.className = "status-badge status-badge--success";
    } else if (completedTests > 0 || linksProvided) {
      headerBadge.textContent = "IN PROGRESS";
      headerBadge.className = "status-badge status-badge--in-progress";
    } else {
      headerBadge.textContent = "NOT STARTED";
      headerBadge.className = "status-badge status-badge--not_applied";
    }
  };

  const navigate = () => {
    let hash = window.location.hash.replace("#", "") || "home";

    // Fallback for unknown hash
    if (!routes[hash]) hash = "home";

    // Navigation Guard for Ship Route
    if (hash === "ship") {
      const completed = TEST_ITEMS.filter(item => testChecklist[item.id]).length;
      if (completed < 10) {
        showToast("You must complete all 10 tests before shipping.");
        window.location.hash = "proof";
        return;
      }
    }

    const templateId = routes[hash];
    const template = document.getElementById(templateId);

    if (template && appView) {
      appView.innerHTML = "";
      appView.appendChild(template.content.cloneNode(true));

      // Update Active Navigation State
      navLinks.forEach(link => {
        link.classList.toggle("active", link.getAttribute("data-route") === hash);
      });

      // Special case: Landing Page highlights nothing (or settings if you prefer)
      // For now, we follow standard active route highlighting.

      // Page Specific Logic
      if (hash === "dashboard") {
        applyFilters();
        // Attach listeners to filter elements
        document.getElementById("keywordSearch")?.addEventListener("input", applyFilters);
        ["locationFilter", "modeFilter", "experienceFilter", "sourceFilter", "statusFilter", "sortOrder", "thresholdToggle"].forEach(id => {
          document.getElementById(id)?.addEventListener("change", applyFilters);
        });
      } else if (hash === "proof") {
        renderProofView();
      } else if (hash === "digest") {
        renderDigestView();
      } else if (hash === "saved") {
        const savedJobs = JOBS_DATA.filter(j => savedJobIds.includes(j.id));
        renderJobsList(document.getElementById("savedJobsList"), savedJobs);
      } else if (hash === "settings") {
        // Prefill settings
        if (userPrefs) {
          document.getElementById("roleKeywords").value = userPrefs.roleKeywords || "";
          document.getElementById("experience").value = userPrefs.experienceLevel || "Fresher";
          document.getElementById("userSkills").value = userPrefs.skills || "";
          document.getElementById("minMatchScore").value = userPrefs.minMatchScore || 40;
          document.getElementById("scoreValue").textContent = userPrefs.minMatchScore || 40;

          // Locations
          if (userPrefs.preferredLocations) {
            document.querySelectorAll("#prefLocations input").forEach(cb => {
              cb.checked = userPrefs.preferredLocations.includes(cb.value);
            });
          }
          // Modes
          if (userPrefs.preferredModes) {
            document.querySelectorAll("#prefModes input").forEach(cb => {
              cb.checked = userPrefs.preferredModes.includes(cb.value);
            });
          }
        }

        // Listener for range slider
        document.getElementById("minMatchScore")?.addEventListener("input", (e) => {
          const valEl = document.getElementById("scoreValue");
          if (valEl) valEl.textContent = e.target.value;
        });
      }

      // Close mobile menu on navigate
      if (mobileMenuToggle) mobileMenuToggle.classList.remove("active");
      if (mobileNavOverlay) mobileNavOverlay.classList.remove("active");
    }
  };

  window.addEventListener("hashchange", navigate);
  navigate(); // Initial load

  // --- Mobile Menu Toggle ---
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener("click", () => {
      mobileMenuToggle.classList.toggle("active");
      if (mobileNavOverlay) mobileNavOverlay.classList.toggle("active");
    });
  }

  // --- Modal Logic ---
  const jobModal = document.getElementById("jobModal");
  const openJobModal = (id) => {
    const job = JOBS_DATA.find(j => j.id == id);
    if (!job) return;

    document.getElementById("modalTitle").textContent = job.title;
    document.getElementById("modalCompany").textContent = job.company;
    document.getElementById("modalLocation").textContent = `${job.location} • ${job.mode}`;
    document.getElementById("modalDescription").textContent = job.description;
    document.getElementById("modalApplyBtn").href = job.applyUrl;

    const skillsList = document.getElementById("modalSkillsList");
    skillsList.innerHTML = job.skills.map(s => `<span class="skill-tag">${s}</span>`).join("");

    jobModal.classList.add("active");
  };

  document.getElementById("closeModal")?.addEventListener("click", () => {
    jobModal.classList.remove("active");
  });

  // Close modal on outside click
  window.addEventListener("click", (e) => {
    if (e.target === jobModal) jobModal.classList.remove("active");
  });

  // --- Global Interaction Logic (Event Delegation) ---
  document.addEventListener("click", (e) => {
    // CTA: Start Tracking
    if (e.target.id === "startTrackingCTA") {
      window.location.hash = "settings";
    }

    // Modal View
    if (e.target.classList.contains("view-job-btn")) {
      openJobModal(e.target.dataset.id);
    }

    // Save Logic
    if (e.target.classList.contains("save-job-btn")) {
      const id = parseInt(e.target.dataset.id);
      if (savedJobIds.includes(id)) {
        savedJobIds = savedJobIds.filter(val => val !== id);
        e.target.textContent = "Save";
        e.target.classList.remove("active");
      } else {
        savedJobIds.push(id);
        e.target.textContent = "Saved";
        e.target.classList.add("active");
      }
      saveToStore();

      // If we are on the saved page, re-render
      if (window.location.hash === "#saved") {
        const savedJobs = JOBS_DATA.filter(j => savedJobIds.includes(j.id));
        renderJobsList(document.getElementById("savedJobsList"), savedJobs);
      }
    }

    // Save Preferences
    if (e.target.id === "savePrefsBtn") {
      const prefs = {
        roleKeywords: document.getElementById("roleKeywords").value,
        experienceLevel: document.getElementById("experience").value,
        skills: document.getElementById("userSkills").value,
        minMatchScore: parseInt(document.getElementById("minMatchScore").value),
        preferredLocations: Array.from(document.querySelectorAll("#prefLocations input:checked")).map(cb => cb.value),
        preferredModes: Array.from(document.querySelectorAll("#prefModes input:checked")).map(cb => cb.value)
      };
      savePreferences(prefs);

      const originalText = e.target.textContent;
      e.target.textContent = "PREFERENCES SAVED";
      e.target.classList.add("btn--success"); // We'll add this class briefly
      setTimeout(() => {
        e.target.textContent = originalText;
        e.target.classList.remove("btn--success");
      }, 2000);
    }

    // Daily Digest Actions
    if (e.target.id === "generateDigestBtn") {
      generateDigest();
    }

    if (e.target.id === "copyDigestBtn" || e.target.id === "emailDigestBtn") {
      const today = new Array(new Date()).map(d => d.toISOString().split("T")[0])[0];
      const digest = JSON.parse(localStorage.getItem(`jobTrackerDigest_${today}`));

      const updates = Object.entries(jobTrackerStatus)
        .map(([id, data]) => {
          const job = JOBS_DATA.find(j => j.id == parseInt(id));
          return { ...job, ...data };
        })
        .filter(u => u && u.status !== 'not_applied')
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 5);

      if (digest) {
        let text = "### 9AM JOB DIGEST\n\n";
        text += digest.map((j, i) => `${i + 1}. ${j.title} @ ${j.company}\n   Score: ${j.matchScore}% | ${j.location}\n   Apply: ${j.applyUrl}`).join("\n\n");

        if (updates.length > 0) {
          text += "\n\n---\n\n### RECENT STATUS UPDATES\n\n";
          text += updates.map(u => `• ${u.title} @ ${u.company}\n  Status: ${u.status.toUpperCase()} (${new Date(u.updatedAt).toLocaleDateString()})`).join("\n\n");
        }

        if (e.target.id === "copyDigestBtn") {
          navigator.clipboard.writeText(text).then(() => {
            const originalText = e.target.textContent;
            e.target.textContent = "COPIED";
            setTimeout(() => e.target.textContent = originalText, 2000);
          });
        } else {
          const mailto = `mailto:?subject=Job Digest & Updates - ${new Date().toLocaleDateString()}&body=${encodeURIComponent(text)}`;
          window.location.href = mailto;
        }
      }
    }

    // Copy Prompt Logic
    if (e.target.id === "copyPromptButton") {
      const promptBox = document.getElementById("promptBox");
      if (promptBox) {
        const text = promptBox.innerText.trim();
        navigator.clipboard.writeText(text).then(() => {
          const originalText = e.target.textContent;
          e.target.textContent = "PROMPT COPIED";
          setTimeout(() => e.target.textContent = originalText, 2000);
        });
      }
    }

    // Reset Tests
    if (e.target.id === "resetTestsBtn" || e.target.closest("#resetTestsBtn")) {
      testChecklist = {};
      isShipped = false;
      saveToStore();
      renderProofView();
      showToast("Test status and shipping status reset.");
    }

    // --- FINAL PROOF PAGE LOGIC ---
    if (e.target.closest("#copySubmissionBtn")) {
      window.handleCopySubmission();
    }

    if (e.target.closest("#shipProjectBtn")) {
      window.handleShipProject();
    }
  });

  // Global Handlers for direct onclick support
  window.handleCopySubmission = () => {
    console.log("handleCopySubmission triggered");
    const lovable = document.getElementById("lovableLink")?.value.trim() || "";
    const github = document.getElementById("githubLink")?.value.trim() || "";
    const deployed = document.getElementById("deployedUrl")?.value.trim() || "";

    if (!lovable || !github || !deployed) {
      alert("Please provide all 3 artifact links first.");
      showToast("Please provide all 3 artifact links first.");
      return;
    }

    const text = `Job Notification Tracker — Final Submission

Lovable Project:
${lovable}

GitHub Repository:
${github}

Live Deployment:
${deployed}

Core Features:
- Intelligent match scoring
- Daily digest simulation
- Status tracking
- Test checklist enforced`;

    copyToClipboard(text);
  };

  window.handleShipProject = () => {
    console.log("handleShipProject triggered");
    const lovable = document.getElementById("lovableLink")?.value.trim() || "";
    const github = document.getElementById("githubLink")?.value.trim() || "";
    const deployed = document.getElementById("deployedUrl")?.value.trim() || "";

    const completedTests = TEST_ITEMS.filter(item => testChecklist[item.id]).length;
    const linksProvided = lovable && github && deployed;

    if (completedTests < 10) {
      alert(`Validation Failed: You have passed ${completedTests}/10 tests. All 10 must be checked.`);
      showToast(`Need 10 tests passed (Currently: ${completedTests})`);
      return;
    }
    if (!linksProvided) {
      alert("Validation Failed: All 3 links (Lovable, GitHub, Vercel) must be filled.");
      showToast("All 3 artifact links must be provided.");
      return;
    }

    if (confirm("Are you sure you want to Ship this project? This will mark it as complete.")) {
      isShipped = true;
      saveToStore();
      renderProofView();
      updateHeaderBadge();
      alert("Project 1 Shipped Successfully!");
      showToast("Project 1 Shipped Successfully.");
    }
  };

  const copyToClipboard = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast("Final submission copied to clipboard!");
      }).catch(err => {
        console.error("Clipboard API failed, trying fallback", err);
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        showToast("Final submission copied to clipboard!");
      } else {
        throw new Error("execCommand returned false");
      }
    } catch (err) {
      console.error("Fallback copy failed", err);
      // Final desperation fallback: Show text in a prompt for manual copy
      window.prompt("Copying failed. Please copy the text below manually:", text);
    }
    document.body.removeChild(textArea);
  };

  const handleArtifactInput = (e) => {
    if (e.target.classList.contains("artifact-input")) {
      const field = e.target.id.replace('Link', '').replace('Url', '');
      artifactLinks[field] = e.target.value.trim();
      saveToStore();
      updateHeaderBadge();
    }
  };

  document.addEventListener("input", handleArtifactInput);
  document.addEventListener("change", handleArtifactInput);

  document.addEventListener("change", (e) => {
    // Test Checklist Toggle
    if (e.target.classList.contains("test-chk")) {
      const id = e.target.dataset.id;
      testChecklist[id] = e.target.checked;
      saveToStore();
      renderTestChecklist();
    }

    // Status Change Logic
    if (e.target.classList.contains("status-select")) {
      const id = parseInt(e.target.dataset.id);
      const newStatus = e.target.value;
      jobTrackerStatus[id] = {
        status: newStatus,
        updatedAt: new Date().toISOString()
      };
      saveToStore();
      showToast(`Status updated: ${newStatus.replace('_', ' ')}`);

      // Update UI if in dashboard or saved view
      const card = e.target.closest(".job-card");
      if (card) {
        const badge = card.querySelector(".status-badge");
        if (badge) {
          badge.className = `status-badge status-badge--${newStatus}`;
          badge.textContent = newStatus.replace('_', ' ');
        }
      }
    }

    // Proof Footer Interaction Logic
    if (e.target.classList.contains("checkbox__input")) {
      const targetId = e.target.getAttribute("data-proof-target");
      const input = document.getElementById(targetId);
      if (input) {
        input.disabled = !e.target.checked;
        if (e.target.checked) input.focus();
      }
    }
  });
});

