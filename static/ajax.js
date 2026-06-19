document.addEventListener('DOMContentLoaded', () => {
    // Attach AJAX handler to all forms on the page
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', async (e) => {
            // Prevent traditional form submission
            e.preventDefault();

            const actionUrl = form.getAttribute('action') || window.location.href;
            const method = form.getAttribute('method') || 'GET';
            const isMultipart = form.getAttribute('enctype') === 'multipart/form-data';

            let fetchOptions = {
                method: method.toUpperCase(),
                headers: {
                    'Accept': 'application/json'
                }
            };

            // Prepare the body
            if (isMultipart) {
                // For file uploads, use FormData directly (fetch sets the correct boundary header automatically)
                fetchOptions.body = new FormData(form);
            } else {
                // For normal forms, convert to URL-encoded string
                const formData = new FormData(form);
                const urlEncoded = new URLSearchParams(formData).toString();
                fetchOptions.body = urlEncoded;
                fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            }

            // Find or create a message container
            let msgContainer = form.parentElement.querySelector('.msg');
            if (!msgContainer) {
                // If there's no dedicated message container, try to find an existing one before the form
                msgContainer = form.previousElementSibling;
                if (!msgContainer || !msgContainer.classList.contains('msg')) {
                    // Create one if it doesn't exist
                    msgContainer = document.createElement('p');
                    msgContainer.className = 'msg';
                    msgContainer.style.display = 'none';
                    form.parentNode.insertBefore(msgContainer, form);
                }
            }

            // Disable submit button during fetch
            const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector('input[type="submit"]');
            const originalBtnText = submitBtn ? submitBtn.innerText : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = 'Processing...';
            }

            try {
                const response = await fetch(actionUrl, fetchOptions);
                let result;
                
                // Check if the response is JSON
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    result = await response.json();
                } else {
                    // Fallback if the server didn't return JSON (e.g. standard redirect or HTML error page)
                    if (response.redirected) {
                        window.location.href = response.url;
                        return;
                    }
                    throw new Error('Server returned an unexpected format.');
                }

                // Handle the JSON response
                if (result.success) {
                    msgContainer.className = 'msg success';
                    msgContainer.innerText = result.message || 'Success!';
                    msgContainer.style.display = 'block';

                    if (result.redirect) {
                        // Short delay before redirect so user can read the success message
                        setTimeout(() => {
                            window.location.href = result.redirect;
                        }, 1000);
                    } else if (result.reload) {
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    } else if (form.getAttribute('data-reset') !== 'false') {
                        // Clear the form if no redirect/reload
                        form.reset();
                    }
                } else {
                    msgContainer.className = 'msg error';
                    msgContainer.innerText = result.message || 'An error occurred.';
                    msgContainer.style.display = 'block';
                }

            } catch (err) {
                console.error('AJAX Error:', err);
                msgContainer.className = 'msg error';
                msgContainer.innerText = 'Network error or server unavailable.';
                msgContainer.style.display = 'block';
            } finally {
                // Restore button state
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
            }
        });
    });
});
