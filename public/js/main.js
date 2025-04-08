/**
 * Main JavaScript for Kroger Grocery Assistant
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initialize Bootstrap tooltips
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function(tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });

  // Show loading spinner when forms are submitted
  const forms = document.querySelectorAll('form');
  const spinnerContainer = document.createElement('div');
  spinnerContainer.className = 'spinner-container';
  spinnerContainer.innerHTML = `
    <div class="spinner-border text-primary spinner" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
  `;
  document.body.appendChild(spinnerContainer);

  forms.forEach(form => {
    form.addEventListener('submit', function() {
      // Don't show spinner for simple navigation forms
      if (this.classList.contains('no-spinner')) {
        return true;
      }
      
      spinnerContainer.classList.add('show');
      setTimeout(() => {
        // Add a timeout to ensure spinner shows even for quick operations
        return true;
      }, 100);
    });
  });

  // Handle grocery list form
  const groceryListForm = document.getElementById('groceryList');
  if (groceryListForm) {
    // Auto-resize textarea as user types
    groceryListForm.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });

    // Parse clipboard data when pasted into textarea
    groceryListForm.addEventListener('paste', function(e) {
      // Allow default paste behavior
      setTimeout(() => {
        // Auto-resize after paste
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
      }, 0);
    });
  }

  // Handle location selection
  const locationRadios = document.querySelectorAll('input[name="locationId"]');
  if (locationRadios.length > 0) {
    locationRadios.forEach(radio => {
      radio.closest('.list-group-item').addEventListener('click', function() {
        // Find the radio input within this list item and select it
        const radioInput = this.querySelector('input[type="radio"]');
        if (radioInput) {
          radioInput.checked = true;
        }
      });
    });
  }

  // Automatically dismiss alerts after 5 seconds
  const alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
  alerts.forEach(alert => {
    setTimeout(() => {
      const bsAlert = new bootstrap.Alert(alert);
      bsAlert.close();
    }, 5000);
  });
});