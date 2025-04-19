/**
 * Main JavaScript for Grocery Assistant
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initialize Bootstrap tooltips
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function(tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
  
  // Initialize modality toggle
  initModalityToggle();

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

    // Store location ID in localStorage when form is submitted
    const locationForm = document.querySelector('form[action="/groceries/locations/select"]');
    if (locationForm) {
      locationForm.addEventListener('submit', function(e) {
        const selectedRadio = document.querySelector('input[name="locationId"]:checked');
        if (selectedRadio) {
          // Store the selected location ID in localStorage
          localStorage.setItem('krogerLocationId', selectedRadio.value);
          console.log('Location ID saved to localStorage:', selectedRadio.value);
        }
      });
    }
  }

  // Check for stored location ID on page load
  const checkStoredLocation = () => {
    // Only run this check on the locations page
    if (window.location.pathname === '/groceries/locations') {
      const storedLocationId = localStorage.getItem('krogerLocationId');
      
      if (storedLocationId) {
        console.log('Found stored location ID:', storedLocationId);
        
        // Create a form to submit the stored location ID
        const autoSelectForm = document.createElement('form');
        autoSelectForm.method = 'POST';
        autoSelectForm.action = '/groceries/locations/select';
        autoSelectForm.style.display = 'none';
        
        const locationInput = document.createElement('input');
        locationInput.type = 'hidden';
        locationInput.name = 'locationId';
        locationInput.value = storedLocationId;
        
        autoSelectForm.appendChild(locationInput);
        document.body.appendChild(autoSelectForm);
        
        // Add a message to inform the user
        const infoDiv = document.createElement('div');
        infoDiv.className = 'alert alert-info';
        infoDiv.innerHTML = 'Using your previously selected store. <button type="button" class="btn btn-sm btn-link" id="changeLocationBtn">Change location</button>';
        
        const cardBody = document.querySelector('.card-body');
        if (cardBody) {
          cardBody.insertBefore(infoDiv, cardBody.firstChild);
        }
        
        // Add event listener for the change location button
        document.getElementById('changeLocationBtn').addEventListener('click', function() {
          infoDiv.remove();
          return false;
        });
        
        // Submit the form after a short delay to allow the user to see the message
        setTimeout(() => {
          // Only submit if the user hasn't clicked the change location button
          if (document.contains(infoDiv)) {
            autoSelectForm.submit();
          }
        }, 1500);
      }
    }
  };
  
  // Run the location check
  checkStoredLocation();

  // Automatically dismiss alerts after 5 seconds
  const alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
  alerts.forEach(alert => {
    setTimeout(() => {
      const bsAlert = new bootstrap.Alert(alert);
      bsAlert.close();
    }, 5000);
  });

  // Configuration Modal Functionality
  const configModal = document.getElementById('configModal');
  // Flag to track if the modal was opened from the header button
  let openedFromHeader = false;
  
  // Add event listener for the header "Change Store" button
  const headerChangeStoreBtn = document.getElementById('headerChangeStoreBtn');
  if (headerChangeStoreBtn) {
    headerChangeStoreBtn.addEventListener('click', function() {
      openedFromHeader = true;
      console.log('Modal opened from header button');
    });
  }
  
  // Reset the flag when the modal is closed
  if (configModal) {
    configModal.addEventListener('hidden.bs.modal', function() {
      openedFromHeader = false;
      console.log('Modal closed, reset openedFromHeader flag');
    });
    
    // Display current store information in the config modal
    const currentStoreDisplay = document.getElementById('currentStoreDisplay');
    if (currentStoreDisplay) {
      const storedLocationId = localStorage.getItem('krogerLocationId');
      if (storedLocationId) {
        currentStoreDisplay.textContent = `Store ID: ${storedLocationId}`;
      } else {
        currentStoreDisplay.textContent = 'No store selected';
      }
    }

    // Handle ZIP code search in config modal
    const searchStoresBtn = document.getElementById('searchStoresBtn');
    const zipCodeConfig = document.getElementById('zipCodeConfig');
    const storeListContainer = document.getElementById('storeListContainer');
    const storeListGroup = document.getElementById('storeListGroup');
    const saveLocationBtn = document.getElementById('saveLocationBtn');

    if (searchStoresBtn && zipCodeConfig) {
      searchStoresBtn.addEventListener('click', async function() {
        const zipCode = zipCodeConfig.value.trim();
        if (!zipCode || !zipCode.match(/^\d{5}$/)) {
          alert('Please enter a valid 5-digit ZIP code');
          return;
        }

        // Show loading indicator
        searchStoresBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Searching...';
        searchStoresBtn.disabled = true;

        try {
          // Fetch stores using the existing endpoint
          const response = await fetch(`/groceries/locations/search?zipCode=${zipCode}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `zipCode=${zipCode}`
          });

          // This will return the full HTML page, so we need to extract the store data
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          
          // Extract store information from the returned HTML
          const storeItems = doc.querySelectorAll('.list-group-item');
          
          // Clear previous results
          storeListGroup.innerHTML = '';
          
          if (storeItems.length === 0) {
            storeListGroup.innerHTML = '<div class="alert alert-warning">No stores found near this ZIP code</div>';
          } else {
            // Create store list items for the modal
            storeItems.forEach(item => {
              const storeInfo = item.querySelector('strong').textContent;
              const storeAddress = item.querySelector('p.mb-1').textContent;
              const radioInput = item.querySelector('input[type="radio"]');
              const locationId = radioInput.value;
              
              const listItem = document.createElement('div');
              listItem.className = 'list-group-item list-group-item-action';
              listItem.innerHTML = `
                <div class="d-flex w-100 justify-content-between align-items-center">
                  <div>
                    <input type="radio" name="configLocationId" value="${locationId}" class="form-check-input me-2">
                    <strong>${storeInfo}</strong>
                    <p class="mb-1 text-muted">${storeAddress}</p>
                  </div>
                </div>
              `;
              
              // Make the whole item clickable
              listItem.addEventListener('click', function() {
                const radio = this.querySelector('input[type="radio"]');
                radio.checked = true;
              });
              
              storeListGroup.appendChild(listItem);
            });
          }
          
          // Show the store list
          storeListContainer.classList.remove('d-none');
          
        } catch (error) {
          console.error('Error fetching stores:', error);
          storeListGroup.innerHTML = '<div class="alert alert-danger">Error fetching stores. Please try again.</div>';
        } finally {
          // Reset button state
          searchStoresBtn.innerHTML = 'Search';
          searchStoresBtn.disabled = false;
        }
      });
    }

    // Handle store selection and saving
    if (saveLocationBtn) {
      saveLocationBtn.addEventListener('click', function() {
        const selectedRadio = document.querySelector('input[name="configLocationId"]:checked');
        if (!selectedRadio) {
          alert('Please select a store');
          return;
        }

        const locationId = selectedRadio.value;
        
        // Store in localStorage
        localStorage.setItem('krogerLocationId', locationId);
        
        // Update the current store display
        if (currentStoreDisplay) {
          currentStoreDisplay.textContent = `Store ID: ${locationId}`;
        }
        
        // Also update the session via AJAX
        fetch('/groceries/check-stored-location?locationId=' + locationId)
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              // Show success message
              const successAlert = document.createElement('div');
              successAlert.className = 'alert alert-success mt-3';
              successAlert.textContent = 'Store location updated successfully!';
              storeListContainer.appendChild(successAlert);
              
              // Hide the alert after 3 seconds
              setTimeout(() => {
                successAlert.remove();
              }, 3000);
              
              // If opened from header, keep the modal open
              // Otherwise, close the modal (default behavior)
              if (!openedFromHeader) {
                // Close the modal programmatically
                const modalInstance = bootstrap.Modal.getInstance(configModal);
                if (modalInstance) {
                  modalInstance.hide();
                }
              } else {
                console.log('Modal opened from header, keeping it open after store selection');
              }
            }
          })
          .catch(error => {
            console.error('Error updating store location:', error);
          });
      });
    }
  }
  
  // Function to initialize and handle the modality toggle
  function initModalityToggle() {
    const modalityToggle = document.getElementById('modalityToggle');
    if (!modalityToggle) return;
    
    const pickupLabel = modalityToggle.parentElement.previousElementSibling;
    const deliveryLabel = modalityToggle.parentElement.nextElementSibling;
    
    // Get stored modality preference or default to DELIVERY
    const storedModality = localStorage.getItem('krogerModality') || 'DELIVERY';
    
    // Set initial toggle state based on stored preference
    if (storedModality === 'DELIVERY') {
      modalityToggle.checked = true;
      deliveryLabel.classList.add('active');
      pickupLabel.classList.remove('active');
    } else {
      modalityToggle.checked = false;
      pickupLabel.classList.add('active');
      deliveryLabel.classList.remove('active');
    }
    
    // Sync the stored modality with the server on page load
    fetch(`/groceries/update-modality?modality=${storedModality}`)
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          console.log('Server session initialized with modality:', storedModality);
        }
      })
      .catch(error => {
        console.error('Error initializing modality on server:', error);
      });
    
    // Handle toggle changes
    modalityToggle.addEventListener('change', function() {
      const modality = this.checked ? 'DELIVERY' : 'PICKUP';
      
      // Update active label styling
      if (modality === 'DELIVERY') {
        deliveryLabel.classList.add('active');
        pickupLabel.classList.remove('active');
      } else {
        pickupLabel.classList.add('active');
        deliveryLabel.classList.remove('active');
      }
      
      // Store preference in localStorage
      localStorage.setItem('krogerModality', modality);
      console.log(`Modality set to: ${modality}`);
      
      // Update the server-side session with the new modality
      fetch(`/groceries/update-modality?modality=${modality}`)
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            console.log('Server session updated with modality:', modality);
          } else {
            console.error('Failed to update server session with modality');
          }
        })
        .catch(error => {
          console.error('Error updating modality on server:', error);
        });
    });
  }
});