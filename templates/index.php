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

// Load translations
script('ncgantt', '../l10n/' . \OC::$server->getL10N('ncgantt')->getLanguageCode());
// PHP translations
$l = \OC::$server->getL10N('ncgantt');
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
				<h3>&#9881; <?php p($l->t('Connection settings')); ?></h3>
				<span class="dropdown-arrow" id="arrow">&#9660;</span>
			</div>
			
			<div class="settings-form" id="settingsForm">
				<div class="form-content">
				<form id="settings-form" method="dialog">
					<div class="form-group">
						<label for="url"><?php p($l->t('Nextcloud URL:')); ?></label>
						<input type="url" id="url" name="url" placeholder="https://your-nextcloud.org">
					</div>
					
					<div class="form-group">
						<label for="username"><?php p($l->t('User name:')); ?></label>
						<input type="text" id="username" name="username" placeholder="ihr.benutzername">
					</div>
					
					<div class="form-group">
						<label for="token"><?php p($l->t('App-Token:')); ?></label>
						<input type="password" id="token" name="token" placeholder="xxxxx-xxxxx-xxxxx-xxxxx-xxxxx">
					</div>
					
					<button type='submit' id="loadBoardsBtn"><?php p($l->t('Load boards')); ?></button> 
					<input type="checkbox" id="storeCookies" style="width:unset;"> <?php p($l->t('Use cookie to store credentials')); ?> </input>
				</form>
				</div>
			</div>    
        </div>
		<div class="status-section">
			<div class="board-selection" id="boardSelection" style="display: flex; margin-top: 0px;">
					<label for="boardSelect"><?php p($l->t('Board:')); ?></label>
					<select class="board-select" id="boardSelect">
						<option value="" disabled hidden> </option>
					</select>
			</div>
			
			<span class="import-export-selection">
					<select class="import-export-select" id="importExportSelect">
						<option value="" disabled selected hidden>&middot;&middot;&middot;</option>
						<option value="export"><?php p($l->t('Export board')); ?></option>
						<option value="import"><?php p($l->t('Import board')); ?><</option>
					</select>
			</span>
			<span class="import-export-buttons">
				<span><button class="import-export-btn" id="boardExportBtn"><?php p($l->t('Export board')); ?></button></span>
				<span><button class="import-export-btn" id="boardImportBtn"><?php p($l->t('Import board')); ?></button></span>
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
