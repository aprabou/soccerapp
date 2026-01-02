const commentsContainer = document.getElementById("comments");
const emptyState = document.getElementById("empty");
const errorState = document.getElementById("error");
const countBadge = document.getElementById("comment-count");
const refreshBtn = document.getElementById("refresh-btn");

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
    countBadge.textContent = "Loading…";
    refreshBtn.disabled = true;
    return;
  }

  refreshBtn.disabled = false;
}

function renderComments(comments) {
  commentsContainer.innerHTML = "";

  if (!comments.length) {
    emptyState.hidden = false;
    countBadge.textContent = "0 comments";
    return;
  }

  emptyState.hidden = true;
  errorState.hidden = true;
  countBadge.textContent = `${comments.length} top-level`;

  const fragment = document.createDocumentFragment();
  comments.forEach((comment) => {
    fragment.appendChild(createCommentCard(comment));
  });

  commentsContainer.appendChild(fragment);
}

function createCommentCard(comment, depth = 0) {
  const card = document.createElement("article");
  card.className = "card";
  card.style.setProperty("--depth", depth);

  const meta = document.createElement("div");
  meta.className = "meta";

  const author = document.createElement("div");
  author.className = "author";
  author.textContent = comment.author;

  const votes = document.createElement("div");
  votes.className = "votes";
  votes.innerHTML = `
    <span title="Upvotes">▲ ${comment.ups ?? 0}</span>
    <span title="Downvotes">▼ ${comment.downs ?? 0}</span>
  `;

  meta.appendChild(author);
  meta.appendChild(votes);
  card.appendChild(meta);

  // Display picks prominently
  if (comment.picks) {
    const picks = document.createElement("div");
    picks.className = "picks";
    picks.textContent = comment.picks;
    card.appendChild(picks);
  }

  // Collapsible notes section
  if (comment.notes) {
    const notesToggle = document.createElement("button");
    notesToggle.className = "toggle-btn";
    notesToggle.textContent = "📝 View Analysis";
    notesToggle.type = "button";

    const notesContent = document.createElement("div");
    notesContent.className = "notes-content";
    notesContent.hidden = true;
    notesContent.textContent = comment.notes;

    notesToggle.addEventListener("click", () => {
      notesContent.hidden = !notesContent.hidden;
      notesToggle.textContent = notesContent.hidden ? "📝 View Analysis" : "📝 Hide Analysis";
    });

    card.appendChild(notesToggle);
    card.appendChild(notesContent);
  }

  // Replies button with modal
  if (comment.replies && comment.replies.length) {
    const repliesBtn = document.createElement("button");
    repliesBtn.className = "toggle-btn replies-btn";
    repliesBtn.textContent = `💬 View ${comment.replies.length} ${comment.replies.length === 1 ? 'Reply' : 'Replies'}`;
    repliesBtn.type = "button";

    repliesBtn.addEventListener("click", () => {
      showRepliesModal(comment.replies, comment.author);
    });

    card.appendChild(repliesBtn);
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

refreshBtn.addEventListener("click", fetchComments);

// Auto-refresh every 2 minutes (120000 ms)
setInterval(fetchComments, 120000);

// Initial load
fetchComments();
