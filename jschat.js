document.addEventListener('DOMContentLoaded', () => {
  const CHAT_NAME_KEY = 'mi-fanhub-chat-name';
  const CHAT_MAX = 150;
  const AVATAR_COLORS = ['#004BA0', '#C9A43B', '#1565C0', '#0F766E', '#7C3AED', '#DB2777'];

  let sb = null;
  try {
    if (window.supabase) {
      sb = window.supabase.createClient(
        "https://c--3cf16348-479e-4373-af6e-aaa0cac57ae9-prod.lovable.cloud",
        "sb_publishable_RpJRyM2RMOiMTY4jrnDFxg_ektpbpf-",
        { auth: { persistSession: false } }
      );
    }
  } catch (e) {
    console.warn('Supabase init failed', e);
  }

  const nameSection = document.getElementById('chat-name-section');
  const inputSection = document.getElementById('chat-input-section');
  const nameInput = document.getElementById('chat-name-input');
  const joinBtn = document.getElementById('chat-join-btn');
  const textInput = document.getElementById('chat-text-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const scrollContainer = document.getElementById('chat-scroll');
  const countSpan = document.getElementById('chat-count');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const alertBox = document.getElementById('chat-alert');
  const changeNameBtn = document.getElementById('change-name-btn');

  let displayName = localStorage.getItem(CHAT_NAME_KEY) || '';
  let messages = [];

  const avatarColor = (name) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  };

  const initials = (name) =>
    name.trim().split(/\s+/).slice(0, 2).map(w => w[0] ? w[0].toUpperCase() : '').join('') || '?';

  const timeAgo = (ts) => {
    const diff = Math.max(0, Date.now() - ts);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const hr = Math.floor(m / 60);
    if (hr < 24) return hr + 'h ago';
    return Math.floor(hr / 24) + 'd ago';
  };

  function updateAuthUI() {
    if (displayName) {
      nameSection.classList.add('hidden');
      inputSection.classList.remove('hidden');
      changeNameBtn.classList.remove('hidden');
    } else {
      nameSection.classList.remove('hidden');
      inputSection.classList.add('hidden');
      changeNameBtn.classList.add('hidden');
    }
  }

  function renderMessages() {
    countSpan.textContent = messages.length;
    if (messages.length === 0) {
      scrollContainer.innerHTML = '<div class="chat-empty">No messages yet. Be the first to cheer for the Paltan!</div>';
      return;
    }

    scrollContainer.innerHTML = messages.map(m => {
      const mine = !!displayName && m.name === displayName;
      return `
        <div class="chat-msg ${mine ? 'mine' : ''}">
          <div class="chat-avatar" style="background: ${avatarColor(m.name || '?')}">${initials(m.name || '?')}</div>
          <div class="chat-body">
            <div class="chat-meta">
              <span class="who">${escapeHtml(m.name)}</span>
              <span class="when">${timeAgo(m.ts)}</span>
            </div>
            <div class="chat-bubble-text">${escapeHtml(m.text)}</div>
          </div>
        </div>
      `;
    }).join('');

    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Event handlers
  joinBtn?.addEventListener('click', () => {
    const val = nameInput.value.trim().slice(0, 24);
    if (!val) return;
    displayName = val;
    localStorage.setItem(CHAT_NAME_KEY, val);
    updateAuthUI();
    renderMessages();
  });

  changeNameBtn?.addEventListener('click', () => {
    displayName = '';
    localStorage.removeItem(CHAT_NAME_KEY);
    updateAuthUI();
    renderMessages();
  });

  async function sendMessage() {
    const text = textInput.value.trim().slice(0, 400);
    if (!text || !displayName || !sb) return;

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';

    const { error } = await sb.from('chat_messages').insert({
      name: displayName,
      text: text,
    });

    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';

    if (error) {
      alertBox.textContent = "Message didn't send — please try again.";
      alertBox.classList.remove('hidden');
    } else {
      textInput.value = '';
      alertBox.classList.add('hidden');
    }
  }

  sendBtn?.addEventListener('click', sendMessage);
  textInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Supabase Realtime init
  if (!sb) {
    statusDot.className = 'status-dot offline';
    statusText.textContent = 'Offline';
    alertBox.textContent = "Live chat couldn't connect. Check your internet connection.";
    alertBox.classList.remove('hidden');
    return;
  }

  updateAuthUI();

  (async () => {
    const { data, error } = await sb
      .from('chat_messages')
      .select('id, name, text, created_at')
      .order('created_at', { ascending: true })
      .limit(CHAT_MAX);

    if (error) {
      alertBox.textContent = "Couldn't load messages.";
      alertBox.classList.remove('hidden');
    } else if (Array.isArray(data)) {
      messages = data.map(r => ({
        id: r.id, name: r.name,
        text: r.text || '',
        ts: new Date(r.created_at).getTime(),
      }));
      renderMessages();
    }
  })();

  sb.channel('mi-fanhub-chat')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      (payload) => {
        const r = payload.new;
        if (!messages.some(m => m.id === r.id)) {
          messages.push({
            id: r.id, name: r.name,
            text: r.text || '',
            ts: new Date(r.created_at).getTime(),
          });
          if (messages.length > CHAT_MAX) messages.shift();
          renderMessages();
        }
      })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        statusDot.className = 'status-dot live';
        statusText.textContent = 'Live';
      } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Offline';
      }
    });
});