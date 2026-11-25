async function loadHome() {
  try {
    const [menu, reviews] = await Promise.all([
      fetch('/api/menu').then(r => r.json()),
      fetch('/api/reviews').then(r => r.json()),
    ]);
    // Signatures: first 3 items from Mains
    const mains = menu.categories.find(c => c.name === 'Mains');
    const sigGrid = document.getElementById('signature-grid');
    if (sigGrid && mains) {
      sigGrid.innerHTML = mains.items.slice(0, 3).map(item => `
        <article class="dish">
          <img src="${item.image_url}" alt="${item.name}" loading="lazy" />
          <h3>${item.name}</h3>
          <p class="price">$${item.price.toFixed(2)}</p>
        </article>
      `).join('');
    }
    const reviewGrid = document.getElementById('review-grid');
    if (reviewGrid) {
      reviewGrid.innerHTML = reviews.map(r => `
        <article class="review">
          <div class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
          <p>"${r.body}"</p>
          <cite>${r.customer}</cite>
        </article>
      `).join('');
    }
  } catch (e) { console.error(e); }
}

if (document.getElementById('signature-grid')) loadHome();