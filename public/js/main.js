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

  // Show loading spinner when forms are submitted (except grocery list form)
  const forms = document.querySelectorAll('form:not(#groceryListForm)');
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

  // Helper function to convert file to base64
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Remove data URL prefix to get just base64
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Handle photo processing
  const photoUpload = document.getElementById('photoUpload');
  const processPhotoBtn = document.getElementById('processPhotoBtn');
  const groceryListTextarea = document.getElementById('groceryList');

  if (processPhotoBtn && photoUpload && groceryListTextarea) {
    processPhotoBtn.addEventListener('click', async function() {
      const file = photoUpload.files[0];
      if (!file) {
        alert('Please select a photo first');
        return;
      }

      // Show loading state
      processPhotoBtn.disabled = true;
      const originalBtnHtml = processPhotoBtn.innerHTML;
      processPhotoBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';

      try {
        // Convert image to base64
        const base64Image = await fileToBase64(file);
        
        // Send to backend
        const response = await fetch('/groceries/process-photo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image: base64Image,
            mimeType: file.type
          })
        });

        const data = await response.json();
        
        if (data.error) {
          alert(data.error);
          return;
        }

        // Populate textarea with extracted text
        groceryListTextarea.value = data.groceryList;
        
        // Auto-resize textarea
        groceryListTextarea.style.height = 'auto';
        groceryListTextarea.style.height = (groceryListTextarea.scrollHeight) + 'px';
        
        // Show success message
        alert('Photo processed! Please review and edit the items as needed.');
        
      } catch (error) {
        console.error('Error processing photo:', error);
        alert('Failed to process photo. Please try again.');
      } finally {
        // Reset button state
        processPhotoBtn.disabled = false;
        processPhotoBtn.innerHTML = originalBtnHtml;
      }
    });
  }

  // Handle grocery list form
  if (groceryListTextarea) {
    // Auto-resize textarea as user types
    groceryListTextarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });

    // Parse clipboard data when pasted into textarea
    groceryListTextarea.addEventListener('paste', function(e) {
      // Allow default paste behavior
      setTimeout(() => {
        // Auto-resize after paste
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
      }, 0);
    });
  }

  // Handle grocery list form submission with SSE progress tracking
  const groceryListForm = document.getElementById('groceryListForm');
  if (groceryListForm) {
    groceryListForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const groceryList = document.getElementById('groceryList').value;
      const submitBtn = document.getElementById('submitBtn');
      const progressContainer = document.getElementById('progressContainer');
      const progressBar = document.getElementById('progressBar');
      const progressMessage = document.getElementById('progressMessage');
      const progressDetails = document.getElementById('progressDetails');
      const resultsContainer = document.getElementById('resultsContainer');
      const resultsList = document.getElementById('resultsList');
      
      // Disable form and show progress
      submitBtn.disabled = true;
      progressContainer.classList.remove('d-none');
      resultsContainer.classList.add('d-none');
      
      try {
        // Submit the grocery list
        const response = await fetch('/groceries/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ groceryList })
        });
        
        const data = await response.json();
        
        if (data.error) {
          alert(data.error);
          submitBtn.disabled = false;
          progressContainer.classList.add('d-none');
          return;
        }
        
        const processId = data.processId;
        
        // Connect to SSE for progress updates
        const eventSource = new EventSource(`/groceries/progress/${processId}`);
        
        eventSource.onmessage = function(event) {
          const update = JSON.parse(event.data);
          
          if (update.type === 'connected') {
            console.log('Connected to progress stream:', update.processId);
          } else if (update.type === 'progress') {
            // Update progress bar
            const percentage = Math.round((update.step / update.totalSteps) * 100);
            progressBar.style.width = `${percentage}%`;
            progressBar.textContent = `${percentage}%`;
            progressBar.setAttribute('aria-valuenow', percentage);
            
            // Update message
            progressMessage.textContent = update.message;
            
            // Update details if available
            if (update.currentItem && update.totalItems) {
              progressDetails.textContent = `Processing item ${update.currentItem} of ${update.totalItems}`;
            } else if (update.actualItems) {
              progressDetails.textContent = `Processing ${update.actualItems} items`;
            } else if (update.estimatedItems) {
              progressDetails.textContent = `Estimated ${update.estimatedItems} items`;
            }
          } else if (update.type === 'complete') {
            // Close event source
            eventSource.close();
            
            // Update to 100%
            progressBar.style.width = '100%';
            progressBar.textContent = '100%';
            progressBar.setAttribute('aria-valuenow', 100);
            progressMessage.textContent = update.message;
            
            // Display results
            displayResults(update.results);
            
            // Re-enable submit button and hide progress
            submitBtn.disabled = false;
            
            // Hide progress after a short delay
            setTimeout(() => {
              progressContainer.classList.add('d-none');
            }, 2000);
          } else if (update.type === 'error') {
            // Close event source
            eventSource.close();
            
            // Show error
            alert(update.message);
            
            // Re-enable submit button
            submitBtn.disabled = false;
            
            // Hide progress
            progressContainer.classList.add('d-none');
          }
        };
        
        eventSource.onerror = function(error) {
          console.error('SSE error:', error);
          eventSource.close();
          
          // Re-enable submit button
          submitBtn.disabled = false;
          
          // Hide progress
          progressContainer.classList.add('d-none');
          
          alert('Connection lost. Please try again.');
        };
        
      } catch (error) {
        console.error('Error submitting form:', error);
        alert('An error occurred. Please try again.');
        
        // Re-enable submit button
        submitBtn.disabled = false;
        
        // Hide progress
        progressContainer.classList.add('d-none');
      }
    });
  }
  
  // Function to display results
  function displayResults(results) {
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsList = document.getElementById('resultsList');
    
    if (!results || results.length === 0) {
      return;
    }
    
    // Clear previous results
    resultsList.innerHTML = '';
    
    // Add each result
    results.forEach(result => {
      const resultItem = document.createElement('div');
      resultItem.className = 'list-group-item';
      
      let badgeClass = 'bg-danger';
      let badgeText = 'Error';
      
      if (result.status === 'added_to_cart') {
        badgeClass = 'bg-success';
        badgeText = 'Added to Cart';
      } else if (result.status === 'not_found') {
        badgeClass = 'bg-warning text-dark';
        badgeText = 'Not Found';
      }
      
      let productHtml = '';
      if (result.product) {
        let imageHtml = '';
        if (result.product.images && result.product.images.length > 0) {
          const thumbnailUrl = result.product.images[0].sizes.find(s => s.size === 'thumbnail')?.url || result.product.images[0].sizes[0]?.url;
          imageHtml = `<img src="${thumbnailUrl}" alt="${result.product.description}" class="me-2" style="max-width: 50px; max-height: 50px;">`;
        }
        
        let priceHtml = '';
        if (result.product.items && result.product.items.length > 0 && result.product.items[0].price) {
          const size = result.product.items[0].size || '';
          const price = result.product.items[0].price.regular.toFixed(2);
          priceHtml = `<small class="text-muted">${size}${size && price ? ' - ' : ''}${price ? '$' + price : ''}</small>`;
        }
        
        productHtml = `
          <div class="mt-2 d-flex align-items-center">
            ${imageHtml}
            <div>
              <strong>${result.product.brand}</strong>
              <p class="mb-0">${result.product.description}</p>
              ${priceHtml}
            </div>
          </div>
        `;
      }
      
      const preferencesHtml = result.item.preferences
        ? `<small class="text-muted">Preferences: ${result.item.preferences}</small><br>`
        : '';
      
      resultItem.innerHTML = `
        <div class="d-flex w-100 justify-content-between">
          <h5 class="mb-1">${result.item.name} (Qty: ${result.item.quantity})</h5>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
        <p class="mb-1">
          ${preferencesHtml}
          ${result.message}
        </p>
        ${productHtml}
      `;
      
      resultsList.appendChild(resultItem);
    });
    
    // Show results container
    resultsContainer.classList.remove('d-none');
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