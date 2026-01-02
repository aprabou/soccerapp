const commentsContainer = document.getElementById("comments");
const emptyState = document.getElementById("empty");
const errorState = document.getElementById("error");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");

let allComments = [];
let currentIndex = 0;

async function fetchComments() {
  try {
    toggleState({ loading: true });
    const res = await fetch("/api/comments");
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }

    const payload = await res.json();
    renderComments(payload.comments || []);
  } catch (err) {
    console.error(err);
    toggleState({ error: true });
  } finally {
    toggleState({ loading: false });
  }
}

function toggleState({ loading = false, error = false }) {
  errorState.hidden = !error;
  emptyState.hidden = true;

  if (loading) {
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    return;
  }
}

function renderComments(comments) {
  allComments = comments;
  currentIndex = 0;

  if (!comments.length) {
    emptyState.hidden = false;
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    return;
  }

  emptyState.hidden = true;
  errorState.hidden = true;

  showCurrentCard();
}

function showCurrentCard() {
  commentsContainer.innerHTML = "";
  
  if (allComments.length === 0) return;

  const comment = allComments[currentIndex];
  const card = createCommentCard(comment);
  commentsContainer.appendChild(card);

  // Update button states
  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === allComments.length - 1;
}

function showNextCard() {
  if (currentIndex < allComments.length - 1) {
    currentIndex++;
    showCurrentCard();
  }
}

function showPrevCard() {
  if (currentIndex > 0) {
    currentIndex--;
    showCurrentCard();
  }
}

function createCommentCard(comment, depth = 0) {
  const card = document.createElement("article");
  card.className = "card";
  card.style.setProperty("--depth", depth);

  // Display picks prominently
  if (comment.picks) {
    const picks = document.createElement("div");
    picks.className = "picks";
    picks.textContent = comment.picks;
    card.appendChild(picks);
  }

  // Votes under picks
  const votes = document.createElement("div");
  votes.className = "votes";
  votes.innerHTML = `
    <span title="Upvotes">▲ ${comment.ups ?? 0}</span>
    <span title="Downvotes">▼ ${comment.downs ?? 0}</span>
  `;
  card.appendChild(votes);

  // Collapsible notes section
  if (comment.notes) {
    const notesToggle = document.createElement("button");
    notesToggle.className = "toggle-btn";
    notesToggle.textContent = "� View Analysis";
    notesToggle.type = "button";

    const notesContent = document.createElement("div");
    notesContent.className = "notes-content";
    notesContent.hidden = true;
    
    // Format notes as quotes with author attribution
    // Extract top 1-2 comments from the notes
    const notesSections = comment.notes.split(/---+/).filter(s => s.trim());
    const topComments = notesSections.slice(0, 2);
    
    topComments.forEach((section, idx) => {
      const authorMatch = section.match(/\*\*(.+?):\*\*/);
      if (authorMatch) {
        const author = authorMatch[1];
        const text = section.replace(/\*\*(.+?):\*\*/, '').trim();
        
        if (text) {
          const quoteDiv = document.createElement('div');
          quoteDiv.style.marginBottom = idx < topComments.length - 1 ? '16px' : '0';
          quoteDiv.innerHTML = `"${text}"<span class="quote-author">— ${author}</span>`;
          notesContent.appendChild(quoteDiv);
        }
      }
    });

    notesToggle.addEventListener("click", () => {
      notesContent.hidden = !notesContent.hidden;
      notesToggle.textContent = notesContent.hidden ? "📝 View Analysis" : "📝 Hide Analysis";
    });

    card.appendChild(notesToggle);
    card.appendChild(notesContent);
  }

  return card;
}

function showRepliesModal(replies, parentAuthor) {
  // Create modal
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Replies to ${parentAuthor}</h3>
        <button class="modal-close" type="button">✕</button>
      </div>
      <div class="modal-body" id="modal-replies"></div>
    </div>
  `;

  const modalBody = modal.querySelector("#modal-replies");
  replies.forEach((reply) => {
    modalBody.appendChild(createReplyCard(reply));
  });

  const closeBtn = modal.querySelector(".modal-close");
  closeBtn.addEventListener("click", () => {
    modal.remove();
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  document.body.appendChild(modal);
}

function createReplyCard(reply) {
  const replyCard = document.createElement("div");
  replyCard.className = "reply-card";

  replyCard.innerHTML = `
    <div class="meta">
      <div class="author">${reply.author}</div>
      <div class="votes">
        <span title="Upvotes">▲ ${reply.ups ?? 0}</span>
        <span title="Downvotes">▼ ${reply.downs ?? 0}</span>
      </div>
    </div>
    ${reply.picks ? `<div class="picks">${reply.picks}</div>` : ''}
    <p class="body">${reply.body}</p>
  `;

  // Nested replies
  if (reply.replies && reply.replies.length) {
    const nestedReplies = document.createElement("div");
    nestedReplies.className = "nested-replies";
    reply.replies.forEach((nested) => {
      nestedReplies.appendChild(createReplyCard(nested));
    });
    replyCard.appendChild(nestedReplies);
  }

  return replyCard;
}

prevBtn.addEventListener("click", showPrevCard);
nextBtn.addEventListener("click", showNextCard);

// Keyboard navigation
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") showPrevCard();
  if (e.key === "ArrowRight") showNextCard();
});

// Auto-refresh every 2 minutes (120000 ms)
setInterval(fetchComments, 120000);

// Initial load
fetchComments();
