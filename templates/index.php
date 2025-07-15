<?php
// Frappe Gantt
script('ncgantt', '../frappe-gantt/1.0.3/dist/frappe-gantt.umd'); // This loads frappe-gantt.umd.js
style('ncgantt', '../frappe-gantt/1.0.3/dist/frappe-gantt');      // This loads frappe-gantt.css

// DOMPurify
script('ncgantt', 'DOMPurify-3.2.6/dist/purify.min');      // This loads frappe-gantt.css

// NcGantt
script('ncgantt', 'nxgantt_GanttHeightManager');  // This loads js/gantt.js
script('ncgantt', 'ncgantt_NCGantt');  // This loads js/gantt.js
style('ncgantt', 'ncgantt');   // This loads css/gantt.css
?> 
	<!--
<!DOCTYPE html>
<html>
<head>
    <title>Deck Boards</title>
</head>
<body>
<div id="app">

    <div id="app-navigation">
        <h2>Gantt Chart</h2>
    </div>
	-->
    <div class="app-ncgantt" id="app-content">
    <div class="gannt_container" id="ganntContainer">
        <!-- <h1>Nextcloud Deck Gantt Chart Viewer</h1> -->
        
        <div class="settings-container hidden" id="settingsContainer">
			<div class="settings-header" id="settingsHeader">
				<h3>&#9881; Connection settings</h3>
				<span class="dropdown-arrow" id="arrow">&#9660;</span>
			</div>
			
			<div class="settings-form" id="settingsForm">
				<div class="form-content">
				<form id="settings-form" method="dialog">
					<div class="form-group">
						<label for="url">Nextcloud URL:</label>
						<input type="url" id="url" name="url" placeholder="https://your-nextcloud.org">
					</div>
					
					<div class="form-group">
						<label for="username">User name:</label>
						<input type="text" id="username" name="username" placeholder="ihr.benutzername">
					</div>
					
					<div class="form-group">
						<label for="token">App-Token:</label>
						<input type="password" id="token" name="token" placeholder="xxxxx-xxxxx-xxxxx-xxxxx-xxxxx">
					</div>
					
					<button type='submit' id="loadBoardsBtn">Load boards</button> 
					<input type="checkbox" id="storeCookies" style="width:unset;"> Use cookie to store credentials (so you don't have to enter them again) </input>
				</form>
				</div>
			</div>    
        </div>
		<div class="status-section">
			<div class="board-selection" id="boardSelection" style="display: flex; margin-top: 0px;">
					<label for="boardSelect">Board:</label>
					<select class="board-select" id="boardSelect">
						<option value="" disabled hidden> </option>
					</select>
			</div>
			
			<span class="import-export-select">
					<select class="import-export-select" id="importExportSelect">
						<option value="" disabled selected hidden>...</option>
						<option value="export">Export board</option>
						<option value="import">Import board</option>
					</select>
			</span>
			<span class="import-export-buttons">
				<span><button class="import-export-btn" id="boardExportBtn">Export board</button></span>
				<span><button class="import-export-btn" id="boardImportBtn">Import board</button></span>
			</span>
			<div id="status"></div> <!-- status messages -->
		</div>
        <div id="gantt-container"></div>
    </div>
    
    </div>
<!--
</div>
</body>
</html>
-->
