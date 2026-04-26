document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatMessages = document.getElementById('chat-messages');
    const botAvatarMain = document.querySelector('.bot-avatar');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const sendBtn = document.getElementById('send-btn');
    const sendIcon = document.getElementById('send-icon');
    const historyList = document.getElementById('history-list');
    const newChatBtn = document.getElementById('new-chat-btn');

    // Mode selection elements
    const modeBtn = document.getElementById('mode-btn');
    const currentModeText = document.getElementById('current-mode-text');
    const dropdownItems = document.querySelectorAll('.dropdown-item');
    const expertSetupBar = document.getElementById('expert-setup-bar');
    const domainInput = document.getElementById('expert-domain-input');
    const setDomainBtn = document.getElementById('set-domain-btn');

    let currentBotType = 'general';
    let currentExpertDomain = 'General';
    let isGenerating = false;
    let typewriterInterval = null;
    let currentSessionId = localStorage.getItem('last_session_id') || 'session_' + Date.now();
    
    localStorage.setItem('last_session_id', currentSessionId);

    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.querySelector('.sidebar');

    // Toggle sidebar on mobile
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    // Auto-scroll function
    const scrollToBottom = () => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    // Format text
    const formatText = (text) => {
        if (!text) return '';
        return text
            .replace(/\n/g, '<br>')
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
    };

    // Typewriter effect
    const typeWriter = (element, text, speed = 15) => {
        let i = 0;
        element.innerHTML = '';
        
        if (typewriterInterval) clearInterval(typewriterInterval);
        
        typewriterInterval = setInterval(() => {
            if (i < text.length) {
                if (text.charAt(i) === '\n') {
                    element.innerHTML += '<br>';
                } else {
                    element.innerHTML += text.charAt(i);
                }
                i++;
                scrollToBottom();
            } else {
                stopGeneration(element, text);
            }
        }, speed);
    };

    const stopGeneration = (element = null, fullText = null) => {
        if (typewriterInterval) {
            clearInterval(typewriterInterval);
            typewriterInterval = null;
        }
        
        if (element && fullText) {
            element.innerHTML = formatText(fullText);
        }
        
        isGenerating = false;
        sendIcon.className = 'fas fa-paper-plane';
        userInput.disabled = false;
        userInput.focus();
        scrollToBottom();
    };

    // Add message to UI
    const addMessage = (text, sender, isTyping = false) => {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);

        const now = new Date();
        const timeString = now.getHours().toString().padStart(2, '0') + ':' +
            now.getMinutes().toString().padStart(2, '0');

        let contentHTML = '';
        if (isTyping) {
            contentHTML = `
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            `;
        } else {
            const avatarHTML = sender === 'bot' ? `
                <div class="msg-avatar-small">
                    <img src="/static/img/chat-bot.gif" alt="Avatar" style="width:100%; height:100%; object-fit:cover;">
                </div>` : '';

            contentHTML = `
                <div class="message-wrapper">
                    ${avatarHTML}
                    <div class="message-content">
                        ${formatText(text)}
                    </div>
                </div>
                <div class="message-info">${sender === 'user' ? 'You' : 'Assistant'} • ${timeString}</div>
            `;
        }

        messageDiv.innerHTML = contentHTML;
        chatMessages.appendChild(messageDiv);
        scrollToBottom();

        return messageDiv;
    };

    // History Logic
    const loadSessions = async () => {
        try {
            const response = await fetch('/sessions');
            const sessions = await response.json();
            historyList.innerHTML = '';
            
            sessions.forEach(sid => {
                const item = document.createElement('div');
                item.classList.add('history-item');
                if (sid === currentSessionId) item.classList.add('active');
                
                item.innerHTML = `
                    <i class="fas fa-message"></i>
                    <span class="session-label">Chat ${sid.substring(sid.length - 4)}</span>
                    <i class="fas fa-trash-alt delete-history-btn" title="Delete Chat"></i>
                `;
                
                // Switch session on item click
                item.addEventListener('click', (e) => {
                    // Don't switch if clicking the delete button
                    if (e.target.classList.contains('delete-history-btn')) return;
                    if (sid !== currentSessionId) {
                        switchSession(sid);
                    }
                });

                // Handle delete
                const deleteBtn = item.querySelector('.delete-history-btn');
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this chat?')) {
                        await deleteSession(sid);
                    }
                });

                historyList.appendChild(item);
            });
        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    };

    const deleteSession = async (sid) => {
        try {
            const response = await fetch('/delete_session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sid })
            });
            const data = await response.json();
            if (data.status === 'success') {
                if (sid === currentSessionId) {
                    // Switch to a new chat if we deleted the current one
                    const newSid = 'session_' + Date.now();
                    await switchSession(newSid);
                }
                loadSessions();
            }
        } catch (error) {
            console.error('Error deleting session:', error);
        }
    };

    const switchSession = async (sid) => {
        currentSessionId = sid;
        localStorage.setItem('last_session_id', sid);
        
        // Update UI active state
        document.querySelectorAll('.history-item').forEach(i => i.classList.remove('active'));
        
        // Close sidebar on mobile
        sidebar.classList.remove('open');

        // Clear and load history
        chatMessages.innerHTML = '';
        await loadChatHistory();
    };

    const loadChatHistory = async () => {
        try {
            const response = await fetch('/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId })
            });
            const history = await response.json();
            
            if (history.length === 0) {
                addMessage("Hello! I'm your premium AI assistant. How can I help you today? ✨", 'bot');
            } else {
                history.forEach(msg => {
                    addMessage(msg.text, msg.sender);
                });
            }
        } catch (error) {
            console.error('Error loading history:', error);
        }
    };

    newChatBtn.addEventListener('click', () => {
        const newSid = 'session_' + Date.now();
        switchSession(newSid);
        loadSessions(); // Refresh list
    });

    // Mode switching logic
    const dropdownContent = document.querySelector('.dropdown-content');

    if (modeBtn) {
        modeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownContent.classList.toggle('show');
        });
    }

    document.addEventListener('click', (e) => {
        if (modeBtn && !modeBtn.contains(e.target) && dropdownContent && !dropdownContent.contains(e.target)) {
            dropdownContent.classList.remove('show');
        }
    });

    dropdownItems.forEach(item => {
        item.addEventListener('click', () => {
            const mode = item.getAttribute('data-mode');
            currentBotType = mode;
            currentModeText.textContent = item.textContent.trim();

            dropdownItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            dropdownContent.classList.remove('show');

            if (mode === 'expert') {
                expertSetupBar.style.display = 'block';
            } else {
                expertSetupBar.style.display = 'none';
            }
        });
    });

    const setupInputGroup = document.getElementById('setup-input-group');
    const setupDisplayGroup = document.getElementById('setup-display-group');
    const activeDomainText = document.getElementById('active-domain-text');
    const editDomainBtn = document.getElementById('edit-domain-btn');

    if (setDomainBtn) {
        setDomainBtn.addEventListener('click', () => {
            const domain = domainInput.value.trim();
            if (domain) {
                currentExpertDomain = domain;
                activeDomainText.textContent = domain;
                setupInputGroup.style.display = 'none';
                setupDisplayGroup.style.display = 'flex';
                addMessage(`Expertise set to: ${domain}. How can I help you in this field?`, 'bot');
            }
        });
    }

    if (editDomainBtn) {
        editDomainBtn.addEventListener('click', () => {
            setupInputGroup.style.display = 'flex';
            setupDisplayGroup.style.display = 'none';
            domainInput.focus();
        });
    }

    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            if (confirm('Clear this chat history?')) {
                // To keep it simple, we just clear UI for now
                chatMessages.innerHTML = '';
                addMessage('Chat history cleared. How can I help you today?', 'bot');
            }
        });
    }

    // Auto-resize textarea
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = (userInput.scrollHeight) + 'px';
    });

    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
        }
    });

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (isGenerating) {
            stopGeneration();
            return;
        }

        const message = userInput.value.trim();
        if (!message) return;

        isGenerating = true;
        sendIcon.className = 'fas fa-stop';
        
        addMessage(message, 'user');
        
        userInput.value = '';
        userInput.style.height = 'auto';
        userInput.disabled = true;
        
        const typingMsg = addMessage('', 'bot', true);
        botAvatarMain.classList.add('thinking');

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    session_id: currentSessionId,
                    bot_type: currentBotType,
                    domain: currentExpertDomain
                }),
            });

            const data = await response.json();

            typingMsg.remove();
            botAvatarMain.classList.remove('thinking');

            if (data.status === 'success') {
                if (isGenerating) {
                    const botMsg = addMessage('', 'bot');
                    const contentDiv = botMsg.querySelector('.message-content');
                    typeWriter(contentDiv, data.message);
                }
                loadSessions(); // Refresh list to show new chat if first message
            } else {
                addMessage('Sorry, I encountered an error. Please try again.', 'bot');
                stopGeneration();
            }
        } catch (error) {
            if (typingMsg) typingMsg.remove();
            botAvatarMain.classList.remove('thinking');
            addMessage('Error connecting to the server.', 'bot');
            console.error('Error:', error);
            stopGeneration();
        }
    });

    // Init
    loadSessions();
    loadChatHistory();
});
