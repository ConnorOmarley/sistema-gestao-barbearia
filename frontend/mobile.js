// Reuse the real table headers so labels stay consistent as rows are refreshed.
(() => {
    document.querySelectorAll('.table-responsive table').forEach(table => {
        const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
        table.classList.add('mobile-table');
        table.setAttribute('role', 'table');
        table.querySelectorAll('thead, tbody').forEach(group => group.setAttribute('role', 'rowgroup'));
        table.querySelectorAll('thead tr').forEach(row => row.setAttribute('role', 'row'));
        table.querySelectorAll('thead th').forEach(th => { th.scope = 'col'; th.setAttribute('role', 'columnheader'); });
        const prepareRows = () => {
            for (const body of table.tBodies) for (const row of body.rows) {
                row.setAttribute('role', 'row');
                [...row.cells].forEach((cell, index) => {
                    cell.setAttribute('role', 'cell');
                    if (cell.colSpan > 1 || cell.querySelector(':scope > .mobile-cell-label')) return;
                    const label = document.createElement('span');
                    label.className = 'mobile-cell-label';
                    label.setAttribute('aria-hidden', 'true');
                    label.textContent = headers[index] || '';
                    const content = document.createElement('div');
                    content.className = 'mobile-cell-content';
                    while (cell.firstChild) content.append(cell.firstChild);
                    cell.append(label, content);
                    if (headers[index] === 'Ações') cell.classList.add('mobile-cell-actions');
                });
            }
        };
        prepareRows();
        // Only watch row additions/removals; wrapping cell content cannot retrigger it.
        const observer = new MutationObserver(prepareRows);
        for (const body of table.tBodies) observer.observe(body, { childList: true });
    });
})();
