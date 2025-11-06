# TODOs

## BOM table scroll

The code below can be entered into the console to prevent the table
headers from scrolling when we scroll the bom.

Needs more work as the columns go out of sync with the
headers when we do "sort by" on a column header.
Not worth the effort right this moment.

```
const style = document.createElement('style');
style.textContent = `
#bomdiv {
display: flex;
flex-direction: column;
overflow: hidden;
}

#bomdiv > div:first-child {
flex-shrink: 0;
background: #1a1a1a;
z-index: 11;
}

.bom {
display: flex;
flex-direction: column;
flex: 1;
overflow: hidden;
width: 100%;
}

#bomhead {
flex-shrink: 0;
display: table;
width: 100%;
table-layout: fixed;
background: #1a1a1a;
z-index: 10;
}

#bomhead tr {
display: table-row;
}

#bombody {
display: block;
overflow-y: scroll;
overflow-x: hidden;
flex: 1;
width: 100%;
}

#bombody tr {
display: table;
width: 100%;
table-layout: fixed;
}

#bomhead th,
#bombody td {
box-sizing: border-box;
}
`;
document.head.appendChild(style);

// Sync column widths using computed pixel widths
function syncColumnWidths() {
const ths = document.querySelectorAll('#bomhead th');
const rows = document.querySelectorAll('#bombody tr');

rows.forEach(row => {
const tds = row.querySelectorAll('td');
ths.forEach((th, index) => {
if (tds[index]) {
const width = th.getBoundingClientRect().width;
tds[index].style.width = width + 'px';
}
});
});
}

// Watch for style changes on th elements
const observer = new MutationObserver(syncColumnWidths);
document.querySelectorAll('#bomhead th').forEach(th => {
observer.observe(th, { attributes: true, attributeFilter: ['style'] });
});

// Sync on window resize
window.addEventListener('resize', syncColumnWidths);

// Initial sync
syncColumnWidths();
```
