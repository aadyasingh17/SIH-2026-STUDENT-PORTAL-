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

// Handles authentication form submission and routes user to target portal view
function handleFormSubmit(event, actionType) {
  event.preventDefault();

  // Close active modals
  closeModal('login-modal');
  closeModal('signup-modal');

  // Route user to their corresponding workspace container
  if (currentRole === 'student') {
    navigateTo('view-student');
  } else if (currentRole === 'college') {
    navigateTo('view-college');
  } else if (currentRole === 'company') {
    navigateTo('view-company');
  }
}

// Close modals when user clicks outside the modal card (on the backdrop overlay)
window.addEventListener('click', function (event) {
  if (event.target.classList.contains('modal-overlay')) {
    event.target.classList.remove('active');
  }
});