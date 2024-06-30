/*!
 * Mundana Jekyll Theme (https://www.wowthemes.net/mundana-jekyll-theme/)
 * Copyright 2019 WowThemes.net
 * Licensed under MIT (https://github.com/wowthemesnet/mundana-theme-jekyll/blob/master/LICENSE.md)
 */

const pageLink = document.querySelectorAll(".page-link");
const firstpage = document.querySelector(".first-page");
const lastpage = document.querySelector(".last-page");

// Navbar behavior
// Removed the code that hides the navbar on scroll
$(document).ready(function () {
  var lastScrollTop = 0;
  $(window).scroll(function (event) {
    var st = $(this).scrollTop();
    if (st > lastScrollTop) {
      // Downscroll code (Commented out)
      // $('.navbar').fadeOut();
    } else {
      // Upscroll code (Commented out)
      // $('.navbar').fadeIn();
    }
    lastScrollTop = st;
  });
});

// Pagination
if (pageLink.length > 0) {
  pageLink[0].parentElement.classList.add("d-none");
  pageLink[pageLink.length - 1].parentElement.classList.add("d-none");
  if (firstpage) {
    firstpage.classList.add("d-none");
  }
  if (lastpage) {
    lastpage.classList.add("d-none");
  }
}

// Search
const searchButton = document.getElementById("search-button");
const searchClose = document.getElementById("search-close");
const searchOverlay = document.getElementById("search-overlay");

searchButton.addEventListener("click", () => {
  searchOverlay.classList.add("visible");
});

searchClose.addEventListener("click", () => {
  searchOverlay.classList.remove("visible");
});

// Responsive tables
var tables = document.querySelectorAll('article table');
tables.forEach(function (table) {
  var wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  table.parentNode.insertBefore(wrapper, table);
  wrapper.appendChild(table);
});

