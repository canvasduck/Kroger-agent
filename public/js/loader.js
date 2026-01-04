/**
 * Thin client loader - polls health endpoint and redirects when server is ready
 */

(function() {
  'use strict';

  const CONFIG = {
    healthEndpoint: '/health',
    loginPath: '/auth/login',
    maxRetries: 30,           // Max attempts before showing error
    initialDelay: 500,        // First check after 500ms
    pollInterval: 1000,       // Check every 1 second
    timeout: 5000,            // Request timeout in ms
  };

  let retryCount = 0;
  let checkInterval = null;

  const elements = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    statusText: document.getElementById('statusText'),
    statusSubtext: document.getElementById('statusSubtext'),
    errorText: document.getElementById('errorText'),
  };

  const statusMessages = [
    'Starting up...',
    'Warming up the server...',
    'Almost ready...',
    'Connecting to services...',
    'Just a moment...',
  ];

  /**
   * Update the status message based on retry count
   */
  function updateStatus() {
    const messageIndex = Math.min(
      Math.floor(retryCount / 6),
      statusMessages.length - 1
    );
    elements.statusText.textContent = statusMessages[messageIndex];

    // Update subtext with attempt info after several retries
    if (retryCount > 5) {
      elements.statusSubtext.textContent = 'Still working on it...';
    }
  }

  /**
   * Show error state and hide loading
   */
  function showError(message) {
    elements.loadingState.classList.add('hide');
    elements.errorState.classList.add('show');
    elements.errorText.textContent = message || 'Unable to connect to server';

    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  }

  /**
   * Reset to loading state
   */
  function showLoading() {
    elements.loadingState.classList.remove('hide');
    elements.errorState.classList.remove('show');
    elements.statusText.textContent = statusMessages[0];
    elements.statusSubtext.textContent = 'This may take a few seconds';
    retryCount = 0;
  }

  /**
   * Check if the server is healthy
   */
  async function checkHealth() {
    retryCount++;
    updateStatus();

    if (retryCount > CONFIG.maxRetries) {
      showError('Server is taking too long to respond. Please try again later.');
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

      const response = await fetch(CONFIG.healthEndpoint, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();

        if (data.status === 'ok' || data.healthy === true) {
          // Server is ready - redirect to login
          if (checkInterval) {
            clearInterval(checkInterval);
          }
          elements.statusText.textContent = 'Ready!';
          elements.statusSubtext.textContent = 'Redirecting...';

          // Small delay for UX, then redirect
          setTimeout(() => {
            window.location.href = CONFIG.loginPath;
          }, 300);
          return;
        }
      }
    } catch (error) {
      // Network error or timeout - server still cold, keep polling
      if (error.name === 'AbortError') {
        console.log('Health check timed out, retrying...');
      } else {
        console.log('Health check failed, retrying...', error.message);
      }
    }
  }

  /**
   * Start the health check polling
   */
  function startHealthCheck() {
    showLoading();

    // Initial check after short delay
    setTimeout(checkHealth, CONFIG.initialDelay);

    // Then poll at regular intervals
    checkInterval = setInterval(checkHealth, CONFIG.pollInterval);
  }

  // Expose startHealthCheck globally for retry button
  window.startHealthCheck = startHealthCheck;

  // Start checking when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startHealthCheck);
  } else {
    startHealthCheck();
  }
})();
