document.addEventListener('DOMContentLoaded', () => {
  const albumsGrid = document.getElementById('albumsGrid');
  const searchInput = document.getElementById('searchInput');
  const clearSearch = document.getElementById('clearSearch');
  const resultsCount = document.getElementById('resultsCount');
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImg');
  const modalTitle = document.getElementById('modalTitle');
  const modalArtist = document.getElementById('modalArtist');
  const downloadBtn = document.getElementById('downloadBtn');
  const closeModal = document.getElementById('closeModal');

  let groupedAlbums = [];
  let previewAudio = null;
  let activePreviewButton = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[character]));
  }

  function getSpotifyUrl(uri, type) {
    const firstUri = String(uri || '').split(',')[0].trim();
    const prefix = `spotify:${type}:`;
    return firstUri.startsWith(prefix)
      ? `https://open.spotify.com/${type}/${firstUri.slice(prefix.length)}`
      : null;
  }

  function formatDuration(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return '';
    const totalSeconds = Math.round(durationMs / 1000);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
  }

  function formatDate(dateValue) {
    const date = new Date(dateValue);
    if (!dateValue || Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-AR', {
      day: 'numeric', month: 'short', year: 'numeric'
    }).format(date);
  }

  function trackPosition(track) {
    if (!track.numeroPista || track.numeroPista < 1) return '';
    return track.numeroDisco > 1 ? `D${track.numeroDisco} · ${track.numeroPista}` : String(track.numeroPista);
  }

  function compareTracks(first, second) {
    const firstDisc = first.numeroDisco || Number.MAX_SAFE_INTEGER;
    const secondDisc = second.numeroDisco || Number.MAX_SAFE_INTEGER;
    const firstTrack = first.numeroPista || Number.MAX_SAFE_INTEGER;
    const secondTrack = second.numeroPista || Number.MAX_SAFE_INTEGER;
    return firstDisc - secondDisc || firstTrack - secondTrack || first.titulo.localeCompare(second.titulo, 'es');
  }

  function processData(data) {
    const albums = new Map();
    data.forEach((item) => {
      const key = `${item.album.trim().toLowerCase()}---${item.artista.trim().toLowerCase()}`;
      const track = {
        titulo: item.cancion,
        uriCancion: item.uriCancion,
        previewUrl: item.previewUrl,
        duracionMs: item.duracionMs,
        numeroDisco: item.numeroDisco,
        numeroPista: item.numeroPista,
        esExplicita: item.esExplicita,
        popularidad: item.popularidad
      };

      if (!albums.has(key)) {
        albums.set(key, {
          album: item.album,
          artista: item.artista,
          portada: item.portada,
          uriArtista: item.uri,
          uriAlbum: item.uriAlbum,
          fecha: item.fecha,
          agregadoEn: item.agregadoEn,
          canciones: [track]
        });
        return;
      }

      const existing = albums.get(key);
      if (!existing.canciones.some((song) => song.titulo === track.titulo)) existing.canciones.push(track);
      if ((existing.portada === 'N/A' || !existing.portada) && item.portada !== 'N/A') existing.portada = item.portada;
      if (!existing.uriAlbum && item.uriAlbum) existing.uriAlbum = item.uriAlbum;
      if (item.agregadoEn && (!existing.agregadoEn || item.agregadoEn > existing.agregadoEn)) existing.agregadoEn = item.agregadoEn;
    });
    return Array.from(albums.values()).map((album) => ({ ...album, canciones: album.canciones.sort(compareTracks) }));
  }

  function previewButtonHtml(track) {
    if (!track.previewUrl) return '';
    return `<button class="preview-btn" type="button" data-preview-url="${escapeHtml(track.previewUrl)}" aria-label="Reproducir vista previa de ${escapeHtml(track.titulo)}" title="Escuchar vista previa"><i class="fa-solid fa-play"></i></button>`;
  }

  function trackHtml(track) {
    const trackUrl = getSpotifyUrl(track.uriCancion, 'track');
    const title = escapeHtml(track.titulo);
    const titleHtml = trackUrl
      ? `<a href="${escapeHtml(trackUrl)}" target="_blank" rel="noopener" class="track-link" title="Abrir en Spotify">${title}</a>`
      : `<span class="track-title">${title}</span>`;
    const popularity = Number.isFinite(track.popularidad)
      ? `<span class="track-popularity" title="Popularidad en Spotify"><i class="fa-solid fa-fire"></i> ${track.popularidad}</span>`
      : '';
    const explicit = track.esExplicita ? '<span class="explicit-tag" title="Contenido explícito">E</span>' : '';
    return `<li class="track-item">
      <span class="track-position">${trackPosition(track)}</span>
      <div class="track-main">${titleHtml}<span class="track-details">${explicit}${popularity}</span></div>
      <span class="track-duration">${formatDuration(track.duracionMs)}</span>
      ${previewButtonHtml(track)}
    </li>`;
  }

  function setPreviewButtonState(button, isPlaying) {
    button.classList.toggle('is-playing', isPlaying);
    button.setAttribute('aria-label', isPlaying ? 'Pausar vista previa' : 'Reproducir vista previa');
    button.title = isPlaying ? 'Pausar vista previa' : 'Escuchar vista previa';
    button.innerHTML = `<i class="fa-solid fa-${isPlaying ? 'pause' : 'play'}"></i>`;
  }

  function stopPreview() {
    if (previewAudio) previewAudio.pause();
    if (activePreviewButton) {
      setPreviewButtonState(activePreviewButton, false);
      activePreviewButton = null;
    }
  }

  function togglePreview(button) {
    const previewUrl = button.dataset.previewUrl;
    if (!previewUrl) return;
    if (activePreviewButton === button && previewAudio && !previewAudio.paused) {
      stopPreview();
      return;
    }

    stopPreview();
    if (!previewAudio) {
      previewAudio = new Audio();
      previewAudio.addEventListener('ended', stopPreview);
      previewAudio.addEventListener('error', stopPreview);
    }

    previewAudio.src = previewUrl;
    previewAudio.play().then(() => {
      activePreviewButton = button;
      setPreviewButtonState(button, true);
    }).catch(stopPreview);
  }

  function renderAlbums(albums) {
    stopPreview();
    albumsGrid.innerHTML = '';
    resultsCount.textContent = `Mostrando ${albums.length} álbumes`;
    if (albums.length === 0) {
      albumsGrid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-compact-disc"></i><p>No se encontraron resultados para tu búsqueda.</p></div>';
      return;
    }

    albums.forEach((album) => {
      const card = document.createElement('article');
      card.className = 'album-card';
      const artistUrl = getSpotifyUrl(album.uriArtista, 'artist');
      const albumUrl = getSpotifyUrl(album.uriAlbum, 'album');
      const artistLink = artistUrl
        ? `<a href="${escapeHtml(artistUrl)}" target="_blank" rel="noopener" class="spotify-artist-link"><i class="fa-brands fa-spotify"></i> Perfil</a>`
        : '';
      const coverSrc = album.portada && album.portada !== 'N/A'
        ? album.portada
        : 'https://via.placeholder.com/300/180f28/a395c4?text=Sin+Portada';
      const releaseYear = album.fecha ? new Date(`${album.fecha}T00:00:00`).getFullYear() : '';
      const albumDetails = [
        releaseYear ? `<span>${releaseYear}</span>` : '',
        album.agregadoEn ? `<span>Agregado ${formatDate(album.agregadoEn)}</span>` : ''
      ].filter(Boolean).join('');
      const albumLink = albumUrl
        ? `<a href="${escapeHtml(albumUrl)}" target="_blank" rel="noopener" class="action-btn spotify-action"><i class="fa-brands fa-spotify"></i> Abrir álbum</a>`
        : '';

      card.innerHTML = `
        <div class="cover-wrapper">
          <img src="${escapeHtml(coverSrc)}" alt="Portada de ${escapeHtml(album.album)}" loading="lazy">
          <div class="cover-overlay"><button class="view-btn" type="button"><i class="fa-solid fa-expand"></i> Ver portada</button></div>
        </div>
        <div class="album-content">
          <h3 class="album-title">${escapeHtml(album.album)}</h3>
          <div class="artist-name"><span>${escapeHtml(album.artista)}</span>${artistLink}</div>
          ${albumDetails ? `<div class="album-details">${albumDetails}</div>` : ''}
          <ul class="track-list">${album.canciones.map(trackHtml).join('')}</ul>
          <div class="album-actions">
            ${albumLink}
            <a href="${escapeHtml(coverSrc)}" target="_blank" rel="noopener" download class="action-btn secondary-action"><i class="fa-solid fa-download"></i> Portada</a>
          </div>
        </div>`;

      card.querySelector('.cover-wrapper').addEventListener('click', () => openModal(coverSrc, album.album, album.artista));
      card.querySelectorAll('.preview-btn').forEach((button) => button.addEventListener('click', () => togglePreview(button)));
      albumsGrid.appendChild(card);
    });
  }

  function openModal(source, title, artist) {
    modalImg.src = source;
    modalTitle.textContent = title;
    modalArtist.textContent = artist;
    downloadBtn.href = source;
    modal.style.display = 'flex';
  }

  closeModal.addEventListener('click', () => { modal.style.display = 'none'; });
  window.addEventListener('click', (event) => { if (event.target === modal) modal.style.display = 'none'; });

  function filterAlbums(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    clearSearch.style.display = term ? 'block' : 'none';
    const filteredAlbums = term
      ? groupedAlbums.filter((album) => album.artista.toLowerCase().includes(term)
        || album.album.toLowerCase().includes(term)
        || album.canciones.some((song) => song.titulo.toLowerCase().includes(term)))
      : groupedAlbums;
    renderAlbums(filteredAlbums);
  }

  searchInput.addEventListener('input', (event) => filterAlbums(event.target.value));
  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    filterAlbums('');
  });

  if (typeof cancionesData !== 'undefined') {
    groupedAlbums = processData(cancionesData);
    renderAlbums(groupedAlbums);
  } else {
    resultsCount.textContent = 'Error: no se encontró la colección musical.';
  }
});
