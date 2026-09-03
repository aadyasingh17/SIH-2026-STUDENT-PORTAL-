// =========================================================
// APPLICATION ROUTER & MODAL LOGIC
// =========================================================

// Global Router: Controls which main view is currently visible
function navigateTo(viewId) {
  // Hide all main view containers
  const views = document.querySelectorAll('.main-view');
  views.forEach(view => {
    view.classList.remove('active');
  });

  // Display the target view container
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active');
  }

  // Scroll back to the top when navigating
  window.scrollTo(0, 0);
}

// Modal Controls: Displays floating overlay with backdrop blur
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    // Clear any previous error or info alerts
    const err = modal.querySelector('[id$="-error"]');
    if (err) {
      err.style.display = 'none';
      err.innerText = '';
    }
    const info = modal.querySelector('[id$="-info"]');
    if (info) {
      info.style.display = 'none';
      info.innerText = '';
    }
    modal.classList.add('active');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

// Track current active role state ('student' | 'college' | 'company')
let currentRole = 'student';

// Switches dynamic inputs based on selected tab inside modals
function setRole(role, formType) {
  currentRole = role;

  // Update tab UI active states
  const container = document.getElementById(`${formType}-role-selector`);
  if (container) {
    const buttons = container.querySelectorAll('.role-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
  }

  const activeBtn = document.getElementById(`${formType}-btn-${role}`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Dynamically update field labels according to role context
  const label = document.getElementById(`${formType}-name-label`);
  const input = document.getElementById(`${formType}-name-input`);

  if (label && input) {
    if (role === 'student') {
      label.innerText = 'Full Name';
      input.placeholder = 'e.g. Rahul Verma';
    } else if (role === 'college') {
      label.innerText = 'College / University Name';
      input.placeholder = 'e.g. National Institute of Technology';
    } else if (role === 'company') {
      label.innerText = 'Company Name';
      input.placeholder = 'e.g. Acme Tech Corp';
    }
  }
}

// =========================================================
// SUPABASE AUTHENTICATION LOGIC
// =========================================================

// Display error or info alerts inside modals
function showAuthMessage(elementId, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerText = message;
  el.style.display = 'block';
}

function clearAuthMessage(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerText = '';
  el.style.display = 'none';
}

// Student & User Signup
async function handleSignup(event) {
  if (event) event.preventDefault();

  clearAuthMessage('signup-error');
  clearAuthMessage('signup-info');

  const nameInput = document.getElementById('signup-name-input');
  const emailInput = document.getElementById('signup-email');
  const passwordInput = document.getElementById('signup-password');
  const submitBtn = document.getElementById('signup-submit-btn');

  const name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!email || !password) {
    showAuthMessage('signup-error', 'Please enter your email and password.');
    return;
  }

  if (password.length < 6) {
    showAuthMessage('signup-error', 'Password must be at least 6 characters long.');
    return;
  }

  if (!window.supabaseClient) {
    showAuthMessage('signup-error', 'Supabase client is not initialized. Please verify configuration.');
    return;
  }

  const originalBtnText = submitBtn ? submitBtn.innerText : 'Sign Up';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Creating account...';
  }

  try {
    const { data, error } = await window.supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: name,
          role: currentRole
        }
      }
    });

    if (error) {
      showAuthMessage('signup-error', error.message);
      return;
    }

    if (data.user && (!data.session || data.user.identities?.length === 0)) {
      if (data.user.identities?.length === 0) {
        showAuthMessage('signup-error', 'An account with this email already exists.');
      } else {
        showAuthMessage('signup-info', 'Account created! Please check your email to verify your address.');
        const form = document.getElementById('signup-form');
        if (form) form.reset();
      }
    } else {
      // User signed up and active session created
      closeModal('signup-modal');
      const form = document.getElementById('signup-form');
      if (form) form.reset();
      routeByRole(currentRole);
    }
  } catch (err) {
    console.error('Signup exception:', err);
    showAuthMessage('signup-error', err.message || 'An unexpected error occurred during signup.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalBtnText;
    }
  }
}

// Student & User Login
async function handleLogin(event) {
  if (event) event.preventDefault();

  clearAuthMessage('login-error');
  clearAuthMessage('login-info');

  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const submitBtn = document.getElementById('login-submit-btn');

  const email = emailInput ? emailInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!email || !password) {
    showAuthMessage('login-error', 'Please enter your email and password.');
    return;
  }

  if (!window.supabaseClient) {
    showAuthMessage('login-error', 'Supabase client is not initialized. Please verify configuration.');
    return;
  }

  const originalBtnText = submitBtn ? submitBtn.innerText : 'Log In';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Logging in...';
  }

  try {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      showAuthMessage('login-error', error.message);
      return;
    }

    // Success: close modal, reset form, route user
    closeModal('login-modal');
    const form = document.getElementById('login-form');
    if (form) form.reset();

    const userRole = data.user?.user_metadata?.role || currentRole || 'student';
    routeByRole(userRole);
  } catch (err) {
    console.error('Login exception:', err);
    showAuthMessage('login-error', err.message || 'An unexpected error occurred during login.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalBtnText;
    }
  }
}

// Logout
async function handleLogout() {
  if (!window.supabaseClient) {
    updateAuthStateUI(null);
    navigateTo('view-home');
    return;
  }

  try {
    const { error } = await window.supabaseClient.auth.signOut();
    if (error) {
      console.error('Sign out error:', error.message);
    }
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    updateAuthStateUI(null);
    navigateTo('view-home');
  }
}

// Navigation helper based on role
function routeByRole(role) {
  if (role === 'college') {
    navigateTo('view-college');
  } else if (role === 'company') {
    navigateTo('view-company');
  } else {
    navigateTo('view-student');
  }
}

// Legacy fallback helper
function handleFormSubmit(event, actionType) {
  if (actionType === 'Login') {
    handleLogin(event);
  } else {
    handleSignup(event);
  }
}

// Synchronize UI elements with active authentication session
function updateAuthStateUI(session) {
  const authBtns = document.getElementById('header-auth-btns');
  const userMenu = document.getElementById('header-user-menu');
  const userEmail = document.getElementById('header-user-email');
  const studentWelcome = document.getElementById('student-welcome-msg');

  if (session && session.user) {
    if (authBtns) authBtns.style.display = 'none';
    if (userMenu) userMenu.style.display = 'flex';
    if (userEmail) {
      userEmail.innerText = session.user.email;
    }
    if (studentWelcome) {
      const displayName = session.user.user_metadata?.full_name || 'Student';
      studentWelcome.innerText = `Welcome back, ${displayName} (${session.user.email})`;
    }
  } else {
    if (authBtns) authBtns.style.display = 'flex';
    if (userMenu) userMenu.style.display = 'none';
    if (userEmail) userEmail.innerText = '';
    if (studentWelcome) studentWelcome.innerText = '';
  }
}

// Initialize Auth Session Check and Listener
function initAuthSession() {
  if (!window.supabaseClient) return;

  // Retrieve existing session from browser storage
  window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
    updateAuthStateUI(session);
  });

  // Listen to realtime auth status transitions
  window.supabaseClient.auth.onAuthStateChange((event, session) => {
    updateAuthStateUI(session);
    if (event === 'SIGNED_OUT') {
      navigateTo('view-home');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthSession);
} else {
  initAuthSession();
}

// Close modals when user clicks outside the modal card (on the backdrop overlay)
window.addEventListener('click', function (event) {
  if (event.target.classList.contains('modal-overlay')) {
    event.target.classList.remove('active');
  }
});