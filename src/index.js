$(function() {
    // index.json is the generated manifest: { "owner/repo": { owner, repository, abandoned, branches: [...] } }
    $.getJSON("/builds/resources/index.json", plugins => {
        $("#repos").html("");

        let keys = Object.keys(plugins).sort((a, b) => sortPlugins(plugins[a], plugins[b]));

        for (let key of keys) {
            console.log(`Found Plugin "${key}"`);
            addPlugin(plugins[key]);
        }
    });
});

function isAbandoned(plugin) {
    return !!plugin.abandoned;
}

// Living plugins first (alphabetical), fully abandoned plugins to the bottom
function sortPlugins(a, b) {
    if (isAbandoned(a) && !isAbandoned(b)) {
        return 1;
    } else if (!isAbandoned(a) && isAbandoned(b)) {
        return -1;
    } else {
        return a.repository.toUpperCase() > b.repository.toUpperCase() ? 1 : -1;
    }
}

// stable first, then experimental, then any other branch alphabetically
function sortBranches(a, b) {
    let order = {stable: 0, experimental: 1};
    let weightA = order[a.branch] !== undefined ? order[a.branch] : 2;
    let weightB = order[b.branch] !== undefined ? order[b.branch] : 2;

    if (weightA !== weightB) {
        return weightA - weightB;
    }

    return a.branch.toUpperCase() > b.branch.toUpperCase() ? 1 : -1;
}

function addPlugin(plugin) {
    let cardId = `plugin_${plugin.owner}_${plugin.repository}`.replace(/[^a-zA-Z0-9_]/g, "_");

    $("#repos").append(
        `<div class="sf-card box_plugin ${isAbandoned(plugin) ? "abandoned" : "alive"}">
            <a class="link_repo sf-card-title" href="https://github.com/${plugin.owner}/${plugin.repository}">
                <img alt="repository" src="https://cdnjs.cloudflare.com/ajax/libs/octicons/8.5.0/svg/repo.svg" class="plugin_icon">
                <span>${plugin.repository}</span>
            </a>
            <div id="${cardId}" class="branch_list"></div>
        </div>`
    );

    let list = $("#" + cardId);

    for (let branch of plugin.branches.slice().sort(sortBranches)) {
        addBranchRow(list, plugin, branch);
    }
}

function addBranchRow(list, plugin, branch) {
    let rowId = branch.directory.replace(/[^a-zA-Z0-9_]/g, "_");
    let prefix = branch.prefix || branch.branch.toUpperCase();
    let abandoned = isAbandoned(plugin);
    let label = `${branch.branch}${abandoned ? " [abandoned]" : ""}`;

    list.append(
        `<div class="branch_row ${abandoned ? "abandoned" : "alive"}" project="${plugin.repository}:${branch.branch}">
            <div class="icon">
                <img alt="branch" src="https://cdnjs.cloudflare.com/ajax/libs/octicons/8.5.0/svg/git-branch.svg" />
            </div>
            <div class="branch_label">
                <a class="link_info" href="${branch.directory}" title="${label}">${label}</a>
                <span class="prefix_tag">${prefix}</span>
            </div>
            <div class="branch_meta">
                <span class="branch_date" id="date_${rowId}">
                    <span class="download_pending">…</span>
                </span>
                <span class="branch_download" id="dl_${rowId}">
                    <span class="download_pending">…</span>
                </span>
                <img class="badge" alt="build badge" src="/builds/${branch.directory}/badge.svg" />
            </div>
        </div>`
    );

    // Resolve the latest jar from this branch's own builds.json (the per-project state file)
    $.getJSON(`/builds/${branch.directory}/builds.json`, builds => {
        let id = builds.last_successful || builds.latest;
        let cell = $("#dl_" + rowId);

        // Last commit date = the most recent build's commit date
        let latest = builds.latest;
        let date = (latest && builds[latest] && builds[latest].date) ? builds[latest].date : "—";
        $("#date_" + rowId).text(date);

        if (id && builds[id]) {
            let label = (builds[id].candidate === "RELEASE" && builds[id].tag) ? builds[id].tag : `#${id}`;
            // Release builds link directly to the published asset; compiled builds to the hosted jar
            let href = builds[id].jarUrl || `${branch.directory}/${plugin.repository}-${id}.jar`;
            cell.html(
                `<a class="download_link" href="${href}" download>
                    <img class="dl_icon" alt="download" src="https://cdnjs.cloudflare.com/ajax/libs/octicons/8.5.0/svg/desktop-download.svg" />
                    <span>Latest jar (${label})</span>
                </a>`
            );
        } else {
            cell.html(`<span class="download_none">no build yet</span>`);
        }
    }).fail(() => {
        $("#dl_" + rowId).html(`<span class="download_none">no build yet</span>`);
        $("#date_" + rowId).text("—");
    });
}
