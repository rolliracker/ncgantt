"use strict";

// NCGantt
/*
User-controlled input
	card.title
	card.description
	label.title
	stack.title
	board.title
All these inputs are escaped after fetching them via the API
*/
class NCGantt {
	// SECURITY: All user input must pass through escapeHtml()
	
    constructor() {
        // Security note
        this.SECURITY_NOTE = "All user input is HTML-escaped before display";

        // State management - all former globals
        this.state = {
            boardData: null,
            boards: null,
            ganttChart: null,
            isOnline: window.navigator.onLine,
            networkError: false,
            update_lastModified: null,
            popupIsOpen: false,
            checkbox_changed: false,
            isUserInteracting: false,
            isUserInteracting_delayed: false,
            enforceUpdateAfterInteraction: false,
            enforceRefreshAfterInteraction: false,
            refreshTitle: null
        };

        // Configuration
        this.config = {
            chart_options: {
                bar_height: 20,
            },
            colorPalette: [
                '#52ba52', '#5ca5d7', '#ff7f0e', '#ad91c6',
                '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
            ],
            update_timer_interval: 2000,
            update_blocking_delay: 2100,
            isNextcloud: this.isInsideNextcloud()
        };

        // Data structures
        this.stackColors = {};
        this.cardFilter = { labels: [], stacks: [] };
        this.pendingCardUpdates = {};
        this.task2stackCardIndex = [];
        this.cardId2taskIndex = {};

        // DOM references
        this.elements = {
            popup_element: null,
            htmlBox: null,
            mdBox: null,
            toggleBtn: null,
            toggleBtn2: null
        };

        // Resource management
        this.timers = {
            updateInterval: null,
            interactionTimeout: null
        };
        this.observers = [];
        this.eventListeners = [];
        this.activeAPICalls = new Map();

        // Symbols
        this.symbols = {
            edit:    '<img src="img/pencil2.svg">',
            confirm: '<img src="img/check-square-outlined.svg">',
			close:   '<img src="img/close-outlined-cross.svg">'
        };

        // Instance managers
        this.ganttHeightManager = null;

        // Settings visibility
        this.isFormVisible = true;
    }

    // Initialization
    async init() {
        try {
            this.setupEnvironment();
            await this.setupEventListeners();
            this.ganttHeightManager = new GanttHeightManager();
            this.ganttHeightManager.init();
            window.ganttHeightManager = this.ganttHeightManager;
            
            // Load initial data
            if (this.config.isNextcloud) {
                await this.fetchBoards();
            } else {
                this.loadSettingsFromCookies();
                if (this.hasStoredCredentials()) {
                    await this.fetchBoards();
                }
            }

            // Start update timer
            this.startUpdateTimer();
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showError('Failed to initialize app: ' + error.message);
        }
    }

    // Cleanup method - CRITICAL for stability
    destroy() {
        // Stop all timers
        Object.values(this.timers).forEach(timer => {
            if (timer) {
                clearInterval(timer);
                clearTimeout(timer);
            }
        });

        // Remove all event listeners
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });

        // Disconnect all observers
        this.observers.forEach(observer => observer.disconnect());

        // Cleanup gantt height manager
        if (this.ganttHeightManager) {
            this.ganttHeightManager.destroy();
        }

        // Clear active API calls
        this.activeAPICalls.clear();

        // Clear references
        this.state = null;
        this.elements = null;
    }

    // Helper to check if inside Nextcloud
    isInsideNextcloud() {
        if (typeof OC !== 'undefined' || typeof OCA !== 'undefined') {
            return true;
        }
        if (window.location.pathname.includes('/apps/')) {
            return true;
        }
        if (document.querySelector('#body-user, #body-public, .nc-')) {
            return true;
        }
        return false;
    }

    // Environment setup
    setupEnvironment() {
        const el = document.getElementById('settingsContainer');
        if (this.config.isNextcloud) {
            el.classList.add("hidden");
            this.symbols.edit =    '<img src="../../custom_apps/ncgantt/img/pencil2.svg">';
            this.symbols.confirm = '<img src="../../custom_apps/ncgantt/img/check-square-outlined.svg">';
            this.symbols.close =   '<img src="../../custom_apps/ncgantt/img/close-outlined-cross.svg">';
        } else {
            el.classList.remove("hidden");
        }
    }

    // Event listener management with automatic cleanup tracking
    addEventListener(element, event, handler, options) {
        if (!element) return;
        element.addEventListener(event, handler, options);
        this.eventListeners.push({ element, event, handler });
    }

    // Centralized event listener setup
    async setupEventListeners() {
        // Settings
        this.addEventListener(
            document.getElementById('settingsHeader'),
            'click',
            () => this.toggleSettings()
        );

		// settingsForm
        this.addEventListener(
            document.getElementById('settingsForm'),
            'submit',
            (e) => this.handleSubmit(e)
        );

        // Board selection
        this.addEventListener(
            document.getElementById('boardSelect'),
            'change',
            () => this.fetchBoardData()
        );

        // Checkbox delegation
        this.addEventListener(
            document,
            'change',
            (event) => {
                if (event.target.classList.contains('description_checkboxes')) {
                    this.handleCheckboxClicked(event.target);
                }
            }
        );

        // boardExportBtn
        this.addEventListener(
            document.getElementById('boardExportBtn'),
            'click',
            () => this.exportBoard()
        );

		// boardImportBtn
        this.addEventListener(
            document.getElementById('boardImportBtn'),
            'click',
            () => this.importBoardFromFile()
        );

        // Import/Export select
        const select = document.getElementById('importExportSelect');
        this.addEventListener(select, 'change', () => {
            switch(select.value) {
                case "export":
                    this.exportBoard();
                    break;
                case "import":
                    this.importBoardFromFile();
                    break;
            }
            select.value = '';
        });

        // Network status
        this.addEventListener(window, 'offline', () => {
            this.state.isOnline = false;
            this.showError("You are offline");
        });

		// Online status
        this.addEventListener(window, 'online', () => {
            this.state.isOnline = true;
            this.showSuccess("You are online");
        });
    }

    // Status display methods
    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.className = type;
            statusEl.textContent = message;
        }
    }

    showError(message) {
        this.showStatus(message, 'error');
    }

    showSuccess(message) {
        this.showStatus(message, 'success');
    }

    // API communication
    async makeApiCall(endpoint, method = 'GET', body = null) {
		//console.log("makeApiCall...", endpoint);
        // Prevent concurrent calls to the same endpoint
        const callKey = `${method}:${endpoint}`;
        if (this.activeAPICalls.has(callKey)) {
            console.warn('Duplicate API call prevented:', callKey);
            return this.activeAPICalls.get(callKey);
        }

        const apiPromise = this._makeApiCallInternal(endpoint, method, body);
        this.activeAPICalls.set(callKey, apiPromise);

        try {
            const result = await apiPromise;
            return result;
        } finally {
            this.activeAPICalls.delete(callKey);
        }
    }

    async _makeApiCallInternal(endpoint, method, body) {
        const apiVersion = 'v1.1';
        
        try {
            if (!window.navigator.onLine) {
                this.state.isOnline = false;
                throw new Error('You are offline');
            }

            let apiUrl = '';
            let options = {};

            if (this.config.isNextcloud) {
                apiUrl = OC.generateUrl(`/apps/deck/api/${apiVersion}${endpoint}`);
                options = {
                    method: method,
                    headers: {
                        'OCS-APIRequest': 'true',
                        'requesttoken': OC.requestToken,
                        'Content-Type': 'application/json'
                    }
                };
            } else {
                const url = document.getElementById('url').value.trim();
                const username = document.getElementById('username').value.trim();
                const token = document.getElementById('token').value.trim();
                
                if (!url || !username || !token) {
                    throw new Error('Please enter all settings');
                }
                
                const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
                apiUrl = `${baseUrl}/index.php/apps/deck/api/${apiVersion}${endpoint}`;
                
                options = {
                    method: method,
                    headers: {
                        'Authorization': 'Basic ' + btoa(username + ':' + token),
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                };
            }

            if (body && method !== 'GET') {
                options.body = JSON.stringify(body);
            }

            const response = await fetch(apiUrl, options);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Response:', errorText);
                throw new Error(`API error`);
            }

            if (!this.state.isOnline || this.state.networkError) {
                this.showSuccess("You are online");
            }
            this.state.networkError = false;
            this.state.isOnline = true;

            return await response.json();
        } catch (error) {
            this.state.networkError = true;
            throw error;
        }
    }

    // Board management
    async fetchBoards() {
        const btn = document.getElementById('loadBoardsBtn');
        btn.disabled = true;
        this.toggleSettings('close');
        this.showStatus('Loading boards...', 'loading');
        console.log('Loading boards...');

        try {
            this.state.boards = await this.makeApiCall('/boards');
            
            const select = document.getElementById('boardSelect');
            select.innerHTML = '<option value="" hidden>-- please select --</option>';
            
            let boards_count = 0;
            this.state.boards.forEach(board => {
                if (!board.deletedAt && !board.archived) {
                    const option = document.createElement('option');
                    option.value = board.id;
                    option.textContent = this.escapeHtml(board.title);
                    select.appendChild(option);
                    boards_count++;
                }
            });
            
            document.getElementById('boardSelection').style.display = 'block';
            this.showSuccess(`${boards_count} Board(s) found`);
            
            this.toggleSettings('close');
            console.log("...Loading boards done!");
            return this.state.boards;
        } catch (error) {
            console.log("Error loading boards:", error);
            this.showError(error.message);
            this.toggleSettings('open');
            console.log("...Loading boards failed!");
        } finally {
            btn.disabled = false;
        }
    }

    async fetchBoardData() {
        console.log("fetchBoardData...");
        this.showStatus('Fetch board data...', 'loading');

        const boardId = document.getElementById('boardSelect').value;
        if (!boardId) return;
        
        try {
            // Fetch board data
            this.state.boardData = await this.makeApiCall(`/boards/${boardId}`);
            
            const completeStacksData = await this.makeApiCall(`/boards/${boardId}/stacks`);
            this.state.boardData.stacks = completeStacksData;
			
			
            
            // Sort stacks
            this.sortStacks();
            
            // Reverse stack order for progress visualization
            this.state.boardData.stacks.reverse();
            
            // Get last modification date
            this.state.update_lastModified = this.state.boardData['lastModified'];

            this.showSuccess('Board data loaded');
            this.createGanttChart();
            
        } catch (error) {
            this.showError(error.message);
        }
    }

    sortStacks() {
		console.log("sortStacks....");
        if (!this.state.boardData.stacks.length) return;
        
        let stack_order_index = {};
        let order_numbers = [];
        let stacks_sorted = [];
		
		console.log("before:");
        this.state.boardData.stacks.forEach((stack, stackIndex) => {
			console.log(" - ", stack.title);
            stack_order_index[stack.order] = stackIndex;
            order_numbers.push(stack.order);
        });
        
        // Check for duplicates
        const has_duplicates = new Set(order_numbers).size !== order_numbers.length;
        
        if (!has_duplicates) {
            order_numbers.sort((a, b) => a - b).forEach((order) => {
                const stack = this.state.boardData.stacks[stack_order_index[order]];
                stacks_sorted.push(stack);
            });
            this.state.boardData.stacks = stacks_sorted;
            console.log("Sorted stacks by order number");
        } else {
            console.log("Sorting stacks cannot be done (duplicate order numbers)", order_numbers);
        }

		console.log("after:");
        this.state.boardData.stacks.forEach((stack, stackIndex) => {
			console.log(" - ", stack.title);
        });
    }

    // Card data management
    async sendCardData(boardId, stackId, cardId, card) {
        console.log("sendCardData...");
        try {
            const endpoint = `/boards/${boardId}/stacks/${stackId}/cards/${cardId}`;
            const result = await this.makeApiCall(endpoint, 'PUT', card);
            
            this.showSuccess('Updated card successfully');
            this.markPendingCardData();
            
            return result;
        } catch (error) {
            this.showError(error.message);
            this.pendingCardUpdates[cardId] = card;
        }
    }

    async sendPendingCardData() {
        if (!Object.keys(this.pendingCardUpdates).length) {
            return;
        }
        
        for (const [cardId, card] of Object.entries(this.pendingCardUpdates)) {
            const boardId = card.boardId;
            const stackId = card.stackId;
            try {
                const result = await this.sendCardData(boardId, stackId, cardId, card);
                if (result) {
                    delete this.pendingCardUpdates[cardId];
                }
            } catch (error) {
                console.log("Sending failed:", error);
            }
        }
        this.markPendingCardData();
    }

    async markPendingCardData() {
        if (this.state.popupIsOpen) {
            return;
        }
        
        const tasks = this.state.ganttChart?.tasks;
        if (!tasks) return;
        
        tasks.forEach((task, taskIndex) => {
            const stackIndex = this.task2stackCardIndex[taskIndex].stack;
            const cardIndex = this.task2stackCardIndex[taskIndex].card;
            const card = this.state.boardData.stacks[stackIndex].cards[cardIndex];
            task.name = this.createSafeHtml_taskName(card);
        });
    }

    // Import/Export functionality
    exportBoard() {
        let filename = "board_data.json";
        if (this.state.boardData && this.state.boardData.title) {
            filename = this.state.boardData.title + ".json";
            filename = this.sanitizeFilename(filename);
        }
        this.exportDictAsJSON(this.state.boardData, filename);
    }

    importBoardFromFile() {
        this.importDictFromJSON((importedBoardData) => {
            this.importBoard(importedBoardData);
        });
    }

    exportDictAsJSON(dict, filename) {
        if (!dict || dict.constructor !== Object) {
            return;
        }

        const jsonString = JSON.stringify(dict, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
    }

    importDictFromJSON(callback) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    callback(json);
                } catch (err) {
                    alert('Invalid JSON file.');
                    console.error(err);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    async importBoard(importedBoardData) {
        try {
            const boardId = await this.importDeckBoard(importedBoardData);
            await this.fetchBoards();
            document.getElementById('boardSelect').value = boardId;
        } catch (error) {
            this.showError(error.message);
            throw error;
        }
    }

	/**
	* Import Deck Board data from file
	* @security The data from file are not checked before they are send to the Deck API - relying on the Deck security measures
	*/
    async importDeckBoard(boardData) {
        console.log("importDeckBoard...");
        try {
            // Check if board exists
            const existingBoards = await this.makeApiCall('/boards', 'GET');
            const existingBoard = existingBoards.find(board => 
                board.title === boardData.title && !board.deletedAt
            );
            
            let boardId;
            
            if (existingBoard) {
                console.log("Board with same title exists...");
				const boardDataTitle_safe = this.escapeHtml(boardData.title);
                const overwrite = confirm(`A board named "${boardDataTitle_safe}" already exists. Do you want to overwrite it?`);
                
                if (!overwrite) {
                    console.log('Import cancelled by user');
                    return null;
                }
                
                // Delete existing board
                console.log("Delete board...");
                try {
                    await this.makeApiCall(`/boards/${existingBoard.id}`, 'DELETE');
                    //console.log(`Deleted existing board: ${existingBoard.title}`);
                } catch (error) {
                    console.error(`Error while deleting board: ${error.message}`);
                    const continueAnyway = confirm(`Deleting the existing board failed. Continue anyway?`);
                    if (!continueAnyway) {
                        console.log('Import cancelled by user');
                        return null;
                    }
                }
            }
            
            // Create new board
            const newBoardData = {
                title: boardData.title,
                color: boardData.color || '0082c9'
            };
            const createdBoard = await this.makeApiCall('/boards', 'POST', newBoardData);
            boardId = createdBoard.id;
            //console.log(`Created board: ${createdBoard.title} (ID: ${boardId})`);
            
            // Delete default labels
            console.log("Delete all labels...");
            for (const label of createdBoard.labels) {
                try {
                    await this.makeApiCall(`/boards/${boardId}/stacks/${label.id}`, 'DELETE');
                } catch {
                    //console.log(`Deleting label '${label.title}' failed`);
                }
            }

            // Create labels
            console.log('Create labels...');
            const labelMapping = {};
            if (boardData.labels && boardData.labels.length > 0) {
                for (const label of boardData.labels) {
                    try {
                        let createdLabelId = null;
                        const existingLabel = createdBoard.labels.find(l => l.title === label.title);
                        if (existingLabel) {
                            //console.log(`Label already exists: ${label.title}`);
                            createdLabelId = existingLabel.id;
                        } else {
                            //console.log(`Create label: ${label.title}`);
                            const labelData = {
                                title: label.title,
                                color: label.color
                            };
                            const createdLabel = await this.makeApiCall(`/boards/${boardId}/labels`, 'POST', labelData);
                            createdLabelId = createdLabel.id;
                        }
                        labelMapping[label.id] = createdLabelId;
                    } catch (error) {
                        //console.log(`Creating label '${label.title}' failed (${error.message}).`);
                    }
                }
            }
            
            // Create stacks and cards
            if (boardData.stacks && boardData.stacks.length > 0) {
                for (const stack of boardData.stacks.reverse()) {
                    // Create stack
                    const stackData = {
                        title: stack.title,
                        order: stack.order
                    };
                    
                    const createdStack = await this.makeApiCall(`/boards/${boardId}/stacks`, 'POST', stackData);
                    const stackId = createdStack.id;
                    //console.log(`Created stack: ${stack.title} (ID: ${stackId})`);
                    
                    // Create cards
                    if (stack.cards && stack.cards.length > 0) {
                        const sortedCards = [...stack.cards].sort((a, b) => a.order - b.order);
                        
                        for (const card of sortedCards) {
                            const cardData = {
                                title: card.title,
                                description: card.description || '',
                                type: card.type || 'plain',
                                order: card.order,
                                duedate: card.duedate || null,
                                done: card.done || null,
                                archived: card.archived || false
                            };
                            
                            const createdCard = await this.makeApiCall(
                                `/boards/${boardId}/stacks/${stackId}/cards`, 
                                'POST', 
                                cardData
                            );
                            const cardId = createdCard.id;
                            //console.log(`Created card: ${card.title} (ID: ${cardId})`);
                            
                            // Set done state
                            if (card.done) {
                                console.log("Set done state");
                                createdCard.done = card.done;
                                await this.makeApiCall(
                                    `/boards/${boardId}/stacks/${stackId}/cards/${cardId}`,
                                    'PUT',
                                    createdCard
                                );
                            }
                            
                            // Assign labels
                            console.log("Assign labels to card...");
                            if (card.labels && card.labels.length > 0) {
                                for (const label of card.labels) {
                                    const newLabelId = labelMapping[label.id];
                                    if (newLabelId) {
                                        await this.makeApiCall(
                                            `/boards/${boardId}/stacks/${stackId}/cards/${cardId}/assignLabel`,
                                            'PUT',
                                            { labelId: newLabelId }
                                        );
                                        //console.log(`Assigned label to card ${card.title}`);
                                    }
                                }
                            }
                            
                            // Add assignees
                            if (card.assignedUsers && card.assignedUsers.length > 0) {
                                for (const user of card.assignedUsers) {
                                    try {
                                        await this.makeApiCall(
                                            `/boards/${boardId}/stacks/${stackId}/cards/${cardId}/assignUser`,
                                            'PUT',
                                            { userId: user.participant.uid }
                                        );
                                        //console.log(`Assigned user ${user.participant.displayname} to card ${card.title}`);
                                    } catch (error) {
                                        console.warn(`Could not assign user ${user.participant.displayname}: ${error.message}`);
                                    }
                                }
                            }
                            
                            // Add comments
                            if (card.comments && card.comments.length > 0) {
                                for (const comment of card.comments) {
                                    try {
                                        await this.makeApiCall(
                                            `/cards/${cardId}/comments`,
                                            'POST',
                                            { message: comment.message }
                                        );
                                        //console.log(`Added comment to card ${card.title}`);
                                    } catch (error) {
                                        console.warn(`Could not add comment: ${error.message}`);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // Set board permissions
            if (boardData.acl && boardData.acl.length > 0) {
                for (const acl of boardData.acl) {
                    try {
                        const aclData = {
                            type: acl.type,
                            participant: acl.participant,
                            permissionEdit: acl.permissionEdit,
                            permissionShare: acl.permissionShare,
                            permissionManage: acl.permissionManage
                        };
                        
                        await this.makeApiCall(`/boards/${boardId}/acl`, 'POST', aclData);
                        console.log(`Added ACL for ${acl.participant}`);
                    } catch (error) {
                        console.warn(`Could not add ACL: ${error.message}`);
                    }
                }
            }
            
            //console.log(`Successfully imported board: ${boardData.title}`);
            return createdBoard.id;
            
        } catch (error) {
            console.error('Error importing board:', error);
            throw error;
        }
    }


	// Ensure clean html injection
    // For text that should never be HTML (titles, labels)
    escapeHtml(text) {
        if (!text) {
			return '';
		}
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    // For HTML content that needs some formatting preserved
	sanitizeHtml(html) {
		// Option 1: Use DOMPurify (recommended)
		if (typeof DOMPurify !== 'undefined') {
/* 			const options = {
				// Allow text and tspan (SVG text elements)
    			ALLOWED_TAGS: [
					'p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'input', 'hr', 
					'text', 'tspan'
				],
	
				// Allow the SVG attributes you're using
				ALLOWED_ATTR: {
					'input': ['type', 'checked', 'disabled', 'class', 'id'],
					'tspan': ['dy', 'fill', 'font-weight', 'font-size']
				},
			   
				// Important: Keep the text content
				KEEP_CONTENT: true,
				
				// Allow SVG namespace
				ADD_TAGS: ['svg'],
				
				// Prevent wrapping in body/html tags
				RETURN_DOM_FRAGMENT: false,
				RETURN_DOM: false
			};
 */			//const sanitized_html = DOMPurify.sanitize(html, options);
			const sanitized_html = DOMPurify.sanitize(html);
			return sanitized_html;
		}
		return null;
	}

	sanitizeFilename(name) {
        return name
            .replace(/[\/\\:*?"<>|]/g, '')
            .trim();
    }


    // Gantt chart creation and management
    createGanttChart() {
        console.log("createGanttChart...");
        if (!this.state.boardData || !this.state.boardData.stacks) {
            this.showError('No board data available');
            return;
        }
        
        const tasks = [];
        let taskIndex = 0;
        let colorIndex = 0;
        this.task2stackCardIndex = [];
        this.cardId2taskIndex = {};
        let cardFound = false;
        
        // Create tasks from all cards
        this.state.boardData.stacks.forEach((stack, stackIndex) => {
            // Assign color to each stack
            this.stackColors[stack.id] = this.config.colorPalette[colorIndex % this.config.colorPalette.length];
            colorIndex++;
            
            if (stack.cards && stack.cards.length > 0) {
                stack.cards.forEach((card, cardIndex) => {
                    cardFound = true;
                    
                    // Filter by label
                    if (this.cardFilter.labels.length) {
                        const labelData = card.labels.filter(label => 
                            this.cardFilter.labels.includes(label.title)
                        );
                        if (labelData.length !== this.cardFilter.labels.length) {
                            return;
                        }
                    }

                    const { start, end, progress } = this.getCardDates(card);
                    
                    // Process description
                    card.description = this.removeEmptyListItems(card.description);
                    
					// convert card description into html to display it in the gantt popup
                    let description_md = card.description;
                    description_md = this.tuneMarkdown(description_md);
                    let description_safeHtml = this.createSafeHtml_markdownToHtml(description_md, true, "t_" + taskIndex);
                    description_safeHtml = this.createSafeHtml_tuneHtmlPopup(description_safeHtml, "t_" + taskIndex);
					
                    tasks.push({
                        id: `card-${card.id}`,
                        name: this.createSafeHtml_taskName(card),
                        start: start,
                        end: end,
                        progress: progress || 0,
                        color: this.stackColors[stack.id],
                        color_progress: '#cfcfcfa3',
                        dependencies: '',
                        custom_class: `stack-${stack.id}`,
                        //stack: stack.title,  // not needed
                        description: description_safeHtml || '',
                        overdue: card.overdue || 0,
                        cardId: card.id,
                        stackId: stack.id,
                        labels: card.labels || []
                    });
                    
                    this.task2stackCardIndex.push({ stack: stackIndex, card: cardIndex });
                    this.cardId2taskIndex[card.id] = taskIndex;
                    taskIndex++;
                });
            }
        });
        
        // Prepare container
        const container = document.getElementById('gantt-container');
        container.innerHTML = '<svg id="gantt"></svg>';
        
        if (tasks.length === 0) {
            this.showError('No cards found');
            if (this.state.ganttChart) {
                this.state.ganttChart.refresh([]);
                this.ganttHeightManager.fixGanttHeight();
            }
        } else {
            try {
                // Create Gantt chart
                this.state.ganttChart = new Gantt('#gantt', tasks, {
                    view_mode: 'Week',
                    date_format: 'YYYY-MM-DD',
                    view_mode_select: true,
                    language: 'de',
                    bar_height: 22,
                    padding: 16,
                    scroll_to: 'start',
                    popup_trigger: 'click',
                    
                    on_date_change: async (task, start, end) => {
                        await this.handleDateChange(task, start, end, tasks);
                    },
                    
                    on_progress_change: async (task, progress) => {
                        await this.handleProgressChange(task, progress, tasks);
                    }
                });
                
                const popup = document.querySelector('.popup-wrapper');
                popup.classList.add("hide");
                
                this.showSuccess(`Created Gantt chart with ${tasks.length} cards`);
            } catch (error) {
                console.error('Error while creating the Gantt chart:', error);
                this.showError('Error while creating the Gantt chart: ' + error.message);
            }
            
            // Post-creation setup
            this.ganttHeightManager.fixGanttHeight();
            this.startUpdateEventListener();
            
            // Add stack separators
            let stackId_last = tasks[0].stackId;
            tasks.forEach((task, taskIndex) => {
                if (task.stackId !== stackId_last) {
                    const rowLines = document.getElementsByClassName('row-line');
                    if (rowLines[taskIndex - 1]) {
                        rowLines[taskIndex - 1].style.stroke = '#c4c4c4';
                    }
                    stackId_last = task.stackId;
                }
            });
            
            // Setup popup observer
            this.elements.popup_element = document.querySelector('.popup-wrapper');
            this.observePopupHide();
        }
        
        this.displayStackColors();
        this.displayLabels();
    }

	/** 
	* Convert card data into a title with additonal information:
	* 1. checkbox statistics (checked/total)
	* 2. display a checkmark if card.done
	* 3. display a warning (!) if task is overdue
	* 4. display card labels
	* @security:
	* 1. User input card.title and label.title is escaped
	* 2. Iser input card.description is only used for counting checkboxes
	*/
	/**
	 * @param {Object} card - Card object
	 * @param {string} card.title - USER INPUT: Already escaped
	 * @returns {string} Safe HTML for SVG text element
	 * @security Returns sanitized HTML safe for innerHTML
	 */
    createSafeHtml_taskName(card) {
        let taskName_html = this.escapeHtml(card.title);
        
        taskName_html += `<tspan dy='-2'>`;

		// count the total number of checkboxes and the ones that are checked in card description
        const checkboxes_stats = this.countMarkdownCheckboxes(card.description);  // this only return numbers
        if (checkboxes_stats['total']) {
            taskName_html += `&nbsp; 
							  <tspan font-weight='bold'>
								(${checkboxes_stats['checked']}/${checkboxes_stats['total']})
							  </tspan>`;
        }

        let checkedTag = '';
        if (card.done) {
            checkedTag = " &#9989;";
        } else if (card.duedate) {
            const currentDate = new Date();
            const dueDate = new Date(card.duedate);
            if (dueDate < currentDate) {
                checkedTag = `&nbsp; <tspan fill='red' font-size='16px' font-weight='bold'>!</tspan>`;
            }
        }
        taskName_html += `${checkedTag}`;
        
        if (card.labels && card.labels.length > 0) {
            const labelTags_safe = card.labels.map(label => 
                `<tspan fill='#${label.color}' font-weight='bold'>[${this.escapeHtml(label.title)}]</tspan>`
            ).join(' ');
            taskName_html += `&nbsp; ${labelTags_safe}`;
        }
        
        if (card.id in this.pendingCardUpdates) {
            taskName_html += ` <tspan dy='-2' fill='#9b9b9b' font-size='18px' font-weight='bold'>&#x21BB;</tspan>`;
        }
        taskName_html += `</tspan>`;
        return taskName_html;
    }

    // Event handlers for Gantt chart
    async handleDateChange(task, start, end, tasks) {
        console.log("on_date_change...");
        try {
            const taskIndex = tasks.indexOf(task);
            const stackIndex = this.task2stackCardIndex[taskIndex].stack;
            const cardIndex = this.task2stackCardIndex[taskIndex].card;
            const card = this.state.boardData.stacks[stackIndex].cards[cardIndex];
            
            // Update description with new start date
            const description_new = this.updateDescriptionDates(card.description, start, task.progress);
            
            // Change card object
            card.description = description_new;
            card.duedate = end.toISOString();
            
            // Send update to Deck API
            await this.sendCardData(this.state.boardData.id, task.stackId, task.cardId, card);
            
            // Update local task data
            task.start = start;
            task.end = end;
            
            task.name = this.createSafeHtml_taskName(card);
            this.state.refreshTitle = {
                taskIndex: taskIndex,
                taskName: task.name
            };
            
        } catch (error) {
            console.error('Error while updating dates:', error);
            this.showError('Error while updating dates: ' + error.message);
        }
    }

    async handleProgressChange(task, progress, tasks) {
        console.log("on_progress_change...");
        try {
            const taskIndex = tasks.indexOf(task);
            const stackIndex = this.task2stackCardIndex[taskIndex].stack;
            const cardIndex = this.task2stackCardIndex[taskIndex].card;
            const card = this.state.boardData.stacks[stackIndex].cards[cardIndex];
            
            // Update description with new progress
            const updatedDescription = this.updateDescriptionDates(card.description, task.start, progress);
            
            // Mark as complete if progress = 100%
            let doneFieldChanged = false;
            if (progress === 100) {
                if (!card.done) {
                    const d = new Date();
                    card.done = d.toISOString();
                    doneFieldChanged = true;
                }
            } else if (card.done) {
                card.done = null;
                doneFieldChanged = true;
            }
            
            // Change card object
            card.description = updatedDescription;
            
            // Send update to Deck API
            await this.sendCardData(this.state.boardData.id, task.stackId, task.cardId, card);
            
            if (doneFieldChanged) {
                task.name = this.createSafeHtml_taskName(card);
                this.state.ganttChart.refresh(tasks);
                this.ganttHeightManager.fixGanttHeight();
            }
            
        } catch (error) {
            console.error('Error while updating progress:', error);
            this.showError('Error while updating progress: ' + error.message);
        }
    }

    // Page layout functions
    displayStackColors() {
        if (!this.state.boardData.stacks.length) return;
        
        const container = document.getElementById('gantt-container');
        const colorDiv = document.createElement('div');
        colorDiv.className = 'stack-colors';
        
        const listTitle = document.createElement('span');
        listTitle.className = 'labels-title';
        listTitle.textContent = 'Lists:';
        colorDiv.appendChild(listTitle);


        this.state.boardData.stacks.forEach(stack => {
			
            const indicator = document.createElement('div');
            indicator.className = 'stack-indicator';
			// Ensure user input is escaped for innerHTML
            indicator.innerHTML = this.createSafeHtml_StackColors(stack);
            colorDiv.appendChild(indicator);
        });
        container.appendChild(colorDiv);
    }
	createSafeHtml_StackColors(stack) {
		// Escape user input
		const safe_stackTitle = this.escapeHtml(stack.title);
		return `
			<div class="color-box" style="background-color: ${this.stackColors[stack.id]}"></div>
			<span>${safe_stackTitle}</span>`;
	}

    displayLabels() {
        // Collect all unique labels
        const allLabels = new Map();
        this.state.boardData.stacks.forEach(stack => {
            if (stack.cards) {
                stack.cards.forEach(card => {
                    if (card.labels) {
                        card.labels.forEach(label => {
                            allLabels.set(label.id, label);
                        });
                    }
                });
            }
        });
        
        if (allLabels.size > 0) {
            const container = document.getElementById('gantt-container');
            const labelSection = document.createElement('div');
            labelSection.className = 'labels-section';
            
            const labelDiv = document.createElement('span');
            labelDiv.className = 'stack-colors';
            
            const labelTitle = document.createElement('span');
            labelTitle.className = 'labels-title';
            labelTitle.textContent = 'Labels:';
            labelDiv.appendChild(labelTitle);
            
            allLabels.forEach(label => {
                const indicator = document.createElement('span');
                indicator.className = 'stack-indicator';
                indicator.innerHTML = this.createSafeHtml_LabelColors(label);
                
                // Event listener for filter by label
                indicator.onclick = () => {
                    if (this.cardFilter.labels.includes(label.title)) {
                        // Remove label from filter
                        const index = this.cardFilter.labels.indexOf(label.title);
                        if (index > -1) {
                            this.cardFilter.labels.splice(index, 1);
                        }
                    } else {
                        // Add label to filter
                        this.cardFilter.labels.push(label.title);
                        indicator.style.borderStyle = "solid";
                    }
                    // Recreate Gantt
                    this.createGanttChart();
                };
                
                // Mark labels added to filter
                if (this.cardFilter.labels.includes(label.title)) {
                    indicator.children[0].style.borderColor = "black";
                    indicator.children[0].innerHTML = "X";
                    const rgb = indicator.children[0].style.backgroundColor
                        .replace("rgb(", "")
                        .replace(")", "")
                        .split(", ");
                    const grayscale = (1 * rgb[0] + 1 * rgb[1] + 1 * rgb[2]) / 3;
                    if (grayscale < 256 / 2) {
                        indicator.children[0].style.color = "white";
                    }
                }

                indicator.style.cursor = "pointer";
                labelDiv.appendChild(indicator);
            });
            
            labelSection.appendChild(labelDiv);
            container.appendChild(labelSection);
        }
    }
	createSafeHtml_LabelColors(label) {
		// Escape user input
		const safe_labelTitle = this.escapeHtml(label.title);
		return `
			<div class="color-box" style="background-color: #${label.color}"></div>
			<span>${safe_labelTitle}</span>`;
	}

    // Date and Progress field handling
    parseDateProgressFromDescription(description) {
        if (!description) return { startDate: null, progress: 0 };
        
        const lines = description.split('\n');
        let startDate = null;
        let progress = 0;
        
        for (const line of lines) {
            // Parse Start date
            const startMatch = line.match(/^(?:Start|Startdatum|Begin):\s*(.+)$/i);
            if (startMatch) {
                const dateStr = startMatch[1].trim();
                const parsed = this.parseDate(dateStr);
                if (parsed && !isNaN(parsed.getTime())) {
                    startDate = parsed;
                }
            }
            
            // Parse Progress
            const progressMatch = line.match(/^(?:Progress|Fortschritt):\s*(\d+)\s*%?$/i);
            if (progressMatch) {
                progress = parseInt(progressMatch[1], 10);
                if (progress > 100) progress = 100;
                if (progress < 0) progress = 0;
            }
        }
        return { startDate, progress };
    }

    parseDate(dateString) {
        if (!dateString) return null;
        
        // Try German format (DD.MM.YYYY)
        const germanMatch = dateString.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (germanMatch) {
            const date = new Date(germanMatch[3], germanMatch[2] - 1, germanMatch[1]);
            if (!isNaN(date.getTime())) return date;
        }
        
        // Try US format (MM/DD/YYYY or MM-DD-YYYY)
        const usMatch = dateString.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (usMatch) {
            const date = new Date(usMatch[3], usMatch[1] - 1, usMatch[2]);
            if (!isNaN(date.getTime())) return date;
        }
        
        // Try ISO format
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) return date;

        return null;
    }

    getCardDates(card) {
        let start = null;
        let end = null;
        
        // Parse start date and progress from description
        const { startDate, progress } = this.parseDateProgressFromDescription(card.description);
        
        if (startDate) {
            start = startDate;
        }
        
        if (card.duedate) {
            end = this.parseDate(card.duedate);
        }
        
        const default_interval = 12; // hours
        
        // If we have end but no start, set start before
        if (end && !start) {
            start = new Date(end);
            start.setHours(start.getHours() - default_interval);
        }
        
        // If we have start but no end, set end after
        if (start && !end) {
            end = new Date(start);
            end.setHours(end.getHours() + default_interval);
        }
        
        // Last resort: use today
        if (!start || !end) {
            start = new Date();
            end = new Date();
            end.setHours(end.getHours() + default_interval);
        }
        
        return { start, end, progress };
    }

    formatDateForUpdate(date) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }

    updateDescriptionDates(description, newStart, newProgress) {
        if (!description) {
            description = '';
        }
        
        const lines = description.split('\n');
        let foundStart = false;
        let foundProgress = false;
        const newLines = [];
        
        // Update existing lines
        for (const line of lines) {
            if (line.match(/^(?:Start|Startdatum|Begin):/i)) {
                newLines.push(`Start: ${this.formatDateForUpdate(newStart)}`);
                foundStart = true;
            } else if (line.match(/^(?:Progress|Fortschritt):/i)) {
                newLines.push(`Progress: ${newProgress}%`);
                foundProgress = true;
            } else {
                newLines.push(line);
            }
        }
        
        // Add missing fields
        const toInsert = [];
        if (!foundStart) {
            toInsert.push(`Start: ${this.formatDateForUpdate(newStart)}`);
        }
        if (!foundProgress) {
            toInsert.push(`Progress: ${newProgress}%`);
        }
        
        if (toInsert.length > 0) {
            if (newLines.length > 0 && newLines[0].trim() !== '') {
                toInsert.push('');
            }
            return [...toInsert, ...newLines].join('\n');
        }
        
        return newLines.join('\n');
    }

    // Markdown processing
    removeEmptyListItems(markdown) {
        const lines = markdown.split('\n');
        
        const filteredLines = lines.filter(line => {
            // Check for empty checkbox items
            const emptyCheckboxPattern = /^[\s\t]*[-*+]\s*\[[x\s]?\]\s*$/i;
            if (emptyCheckboxPattern.test(line)) {
                return false;
            }
            
            // Check for empty regular list items
            const emptyListPattern = /^[\s\t]*[-*+]\s*$/;
            if (emptyListPattern.test(line)) {
                return false;
            }
            
            // Check for empty numbered list items
            const emptyNumberedPattern = /^[\s\t]*\d+\.\s*$/;
            if (emptyNumberedPattern.test(line)) {
                return false;
            }
            
            return true;
        });
        
        return filteredLines.join('\n');
    }

	/**
	 * Converts markdown to HTML with security sanitization
	 * @security Two-layer approach:
	 * 1. Basic escaping during parsing
	 * 2. Full HTML sanitization at the end (removes any XSS)
	 */
    createSafeHtml_markdownToHtml(markdown, interactive = false, parent_id = '') {
        const lines = markdown.split('\n');
        const result = [];
        const stack = [];
        let currentLevel = -1;
        
        // Helper to calculate indentation level
        function getIndentLevel(line) {
            const match = line.match(/^(\s*)/);
            if (!match) return 0;
            const spaces = match[1];
            return spaces.split('').reduce((count, char) => {
                return count + (char === '\t' ? 2 : 1);
            }, 0) / 2;
        }
        
        // Helper to determine list type and extract content
        function parseListItem(line) {
            const trimmed = line.trimStart();
            
            // Check for checkbox
            if (trimmed.match(/^[-*+] \[([ x])\]/)) {
                const checked = trimmed[3] === 'x';
                const content = trimmed.substring(6).trim();
                return {
                    type: 'checkbox',
                    checked,
                    content
                };
            }
            
            // Check for unordered list
            if (trimmed.match(/^[-*+]\s/)) {
                const content = trimmed.substring(2).trim();
                return {
                    type: 'ul',
                    content
                };
            }
            
            // Check for ordered list
            if (trimmed.match(/^\d+\.\s/)) {
                const content = trimmed.replace(/^\d+\.\s/, '').trim();
                return {
                    type: 'ol',
                    content
                };
            }
            return null;
        }
        
        // Helper to close lists
        function closeLists(targetLevel) {
            while (currentLevel > targetLevel) {
                const listType = stack.pop();
                result.push(`</${listType}>`);
                currentLevel--;
            }
        }
        
        // Helper to escape HTML
        function escapeHtml(text) {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            
            let escaped = text.replace(/[&<>"']/g, m => map[m]);
            
            // Convert markdown formatting
            escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            escaped = escaped.replace(/__([^_]+)__/g, '<strong>$1</strong>');
            escaped = escaped.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
            escaped = escaped.replace(/(?<!_)_(?!_)([^_]+)(?<!_)_(?!_)/g, '<em>$1</em>');
            
            return escaped;
        }
        
        let checkbox_count = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (!line.trim()) {
                if (currentLevel >= 0) {
                    closeLists(-1);
                }
                
                let emptyCount = 1;
                let j = i + 1;
                while (j < lines.length && !lines[j].trim()) {
                    emptyCount++;
                    j++;
                }
                
                if (j < lines.length && !parseListItem(lines[j])) {
                    if (emptyCount > 1) {
                        result.push('<br>'.repeat(emptyCount - 1));
                    }
                }
                
                i = j - 1;
                continue;
            }
            
            const indent = getIndentLevel(line);
            const listItem = parseListItem(line);
            
            if (listItem) {
                const needsList = listItem.type === 'checkbox' || listItem.type === 'ul' ? 'ul' : 'ol';
                
                if (indent < currentLevel) {
                    closeLists(indent);
                }
                
                if (indent > currentLevel) {
                    result.push(`<${needsList}>`);
                    stack.push(needsList);
                    currentLevel = indent;
                } else if (indent === currentLevel && stack[stack.length - 1] !== needsList) {
                    closeLists(indent - 1);
                    result.push(`<${needsList}>`);
                    stack.push(needsList);
                    currentLevel = indent;
                }
                
                let contentParts = [escapeHtml(listItem.content)];
                
                let j = i + 1;
                while (j < lines.length && lines[j].trim() !== '') {
                    const nextLine = lines[j];
                    const nextIndent = getIndentLevel(nextLine);
                    const nextListItem = parseListItem(nextLine);
                    
                    if (!nextListItem && nextIndent >= indent) {
                        contentParts.push(escapeHtml(nextLine.trim()));
                        i = j;
                        j++;
                    } else {
                        break;
                    }
                }
                
                const fullContent = contentParts.join('<br>');
                
                if (listItem.type === 'checkbox') {
                    const disabled = interactive ? '' : ' disabled';
                    result.push(`<li><input type="checkbox"${listItem.checked ? ' checked' : ''}${disabled} class="description_checkboxes" id="${parent_id}_${checkbox_count}">${fullContent}</li>`);
                    checkbox_count++;
                } else {
                    result.push(`<li>${fullContent}</li>`);
                }
            } else {
                closeLists(-1);
                
                let paragraphLines = [escapeHtml(line.trim())];
                let j = i + 1;
                
                while (j < lines.length) {
                    if (!lines[j].trim()) {
                        break;
                    }
                    
                    if (parseListItem(lines[j])) {
                        break;
                    }
                    
                    paragraphLines.push(escapeHtml(lines[j].trim()));
                    i = j;
                    j++;
                }
                
                const paragraphContent = paragraphLines.join('<br>');
                result.push(`<p>${paragraphContent}</p>`);
                
                let extraBreaks = 0;
                let k = i + 1;
                while (k < lines.length && lines[k].trim() === '') {
                    extraBreaks++;
                    k++;
                }
                
                if (extraBreaks > 1) {
                    result.push('<br>'.repeat(extraBreaks - 1));
                }
                
                if (extraBreaks > 0) {
                    i = k - 1;
                }
            }
        }
       
        closeLists(-1);
        
		const rawHtml = result.join('\n');
		
		// SECURITY: Final sanitization pass removes any potential XSS
		// This catches any bugs in the parser above
		return this.sanitizeHtml(rawHtml);
    }

    tuneMarkdown(mdText) {
        const searchPattern_exclude = /^(?:Start|Startdatum|Progress|Fortschritt):/i;
        mdText = mdText.replaceAll('\n\n\n', '\n\n');
        mdText = mdText.split('\n').filter(line => !line.match(searchPattern_exclude)).join('\n');
		// remove empty lines at the beginning
		mdText = mdText.replace(/^\n/, '');
        return mdText;
    }

	/**
	 * Sets up the costum html for the task popup
	 * @security The html output stays safe if the input is safe because it does not insert user input
	 */
    createSafeHtml_tuneHtmlPopup(safeHtml, parent_id = '') {
		let html = safeHtml;
        html = `
            <div class="html_box" id="${parent_id}"><span>
                ${html}</span>
                <span class="html-md-icon-toggle" id="toggleBtn">${this.symbols.edit}</span>
            </div>
            <div class="md_box hide">
                <textarea class="md_textarea"></textarea>
                <span class="html-md-icon-toggle" id="toggleBtn2">${this.symbols.confirm}</span>
            </div>
        `;

        html = html.replace(/^<br\s*\/?>/, '');

        if (html.replaceAll('\n', '').replaceAll(' ', '').length) {
            html += '<hr class="popup-bottom-line">';
        }
        html = '<hr class="popup-top-line">' + html;
        
        html = html.replaceAll('<br><br>', '<br>');

        html = `
            <div class="popup-close-button">${this.symbols.close}</div>
            <div id="htmlOutput">` 
            + html +
            `</div>`;
        
        return html;
    }

    countMarkdownCheckboxes(markdownString) {
        const checkboxRegex = /^[\s]*[-*+]\s*\[(.?)\]/gm;
        
        const matches = [...markdownString.matchAll(checkboxRegex)];
        const totalCheckboxes = matches.length;
        
        const checkedCheckboxes = matches.filter(match => {
            const checkboxContent = match[1];
            return checkboxContent && checkboxContent.trim() !== '';
        }).length;
        
        return {
            total: totalCheckboxes,
            checked: checkedCheckboxes,
            unchecked: totalCheckboxes - checkedCheckboxes
        };
    }

    // Regular updates
    startUpdateTimer() {
        this.stopUpdateTimer();
        this.timers.updateInterval = setInterval(
            () => this.checkRemoteBoardUpdates(),
            this.config.update_timer_interval
        );
    }

    stopUpdateTimer() {
        if (this.timers.updateInterval) {
            clearInterval(this.timers.updateInterval);
            this.timers.updateInterval = null;
        }
    }

    // User interaction tracking
    startInteraction() {
        console.log("startInteraction");
        this.state.isUserInteracting = true;
        this.state.isUserInteracting_delayed = true;
        
        if (this.timers.interactionTimeout) {
            clearTimeout(this.timers.interactionTimeout);
        }
    }

    stopInteraction() {
        console.log("stopInteraction");
        if (this.timers.interactionTimeout) {
            clearTimeout(this.timers.interactionTimeout);
        }
        
        this.state.isUserInteracting = false;

        if (this.state.refreshTitle) {
            this.refreshTaskTitle();
        }
        
        this.timers.interactionTimeout = setTimeout(() => {
            console.log("isUserInteracting_delayed = false");
            this.state.isUserInteracting_delayed = false;
            
            if (this.state.enforceUpdateAfterInteraction) {
                this.checkRemoteBoardUpdates(true);
                this.state.enforceUpdateAfterInteraction = false;
            }
        }, this.config.update_blocking_delay);
    }

    refreshTaskTitle() {
        if (!this.state.refreshTitle) return;
        
        console.log('Refresh Title ...');
        const { taskIndex, taskName } = this.state.refreshTitle;
        const barLabels = document.getElementsByClassName('bar-label');
        if (barLabels[taskIndex]) {
			// taskName is already safe HTML from createSafeHtml_taskName()
			barLabels[taskIndex].innerHTML = taskName;
        }
        this.state.refreshTitle = null;
    }

    startUpdateEventListener() {
        const ganttElement = document.querySelector('.gantt');
        if (ganttElement) {
            this.addEventListener(ganttElement, 'mousedown', () => this.startInteraction());
            this.addEventListener(window, 'mouseup', () => this.stopInteraction());
            
            // Touch events
            this.addEventListener(ganttElement, 'touchstart', () => this.startInteraction());
            this.addEventListener(window, 'touchend', () => this.stopInteraction());
        }
    }

    async checkRemoteBoardUpdates(enforce = false) {
        if (enforce) console.log("enforced board update...");

        try {
            // Send pending card changes first
            await this.sendPendingCardData();
            
            const boardId = document.getElementById('boardSelect').value;
            if (!boardId) {
                return;
            }
            
            // Get last modification date
            const plainBoardData = await this.makeApiCall(`/boards/${boardId}`);
            const update_lastModified_new = plainBoardData['lastModified'];
            
            // Don't update when popup is open or user is interacting
            if ((this.state.popupIsOpen || this.state.isUserInteracting_delayed) && !enforce) {
                this.state.update_lastModified = update_lastModified_new;
                return;
            }

            // Fetch full board data if needed
            if (enforce || update_lastModified_new > this.state.update_lastModified) {
                await this.fetchBoardData();
                this.state.update_lastModified = update_lastModified_new;
            }
        } catch (error) {
            this.showError(error.message);
        }
    }

    // Handle user changes
    async handleCheckboxClicked(checkbox) {
        console.log("handleCheckboxClicked...");
        this.startInteraction();

        const checked = checkbox.checked;
        
        // Get indices and card object
        const taskIndex = checkbox.id.split("_")[1];
        const checkbox_num = checkbox.id.split("_")[2];
        const stackIndex = this.task2stackCardIndex[taskIndex].stack;
        const cardIndex = this.task2stackCardIndex[taskIndex].card;
        
        // Get card from boardData
        const card = this.state.boardData.stacks[stackIndex].cards[cardIndex];

        // Change current card description
        let description_md = card.description;
        description_md = this.setCheckboxState(description_md, checkbox_num, checked);
        card.description = description_md;

        // Adjust title
        this.adjustPopupTitleWithCheckboxStats(description_md);
        
        // Adjust markdown textarea
        if (this.elements.mdBox) {
            const textarea = this.elements.mdBox.getElementsByTagName('textarea')[0];
            description_md = this.tuneMarkdown(description_md);
            textarea.textContent = description_md;
        }
		
        // Send to API
        const stackId = this.state.boardData.stacks[stackIndex].id;
        await this.sendCardData(this.state.boardData.id, stackId, card.id, card);
        
        this.state.checkbox_changed = true;
        this.stopInteraction();
    }

    setCheckboxState(markdown, n, checked = true) {
        n = parseInt(n);
        const checkboxRegex = /^(\s*[-*+]\s*\[)( |x|X)(\])/gm;
        let match;
        let count = 0;
        let indexToReplace = -1;
        let replacement = '';

        while ((match = checkboxRegex.exec(markdown)) !== null) {
            if (count === n) {
                indexToReplace = match.index;
                replacement = match[1] + (checked ? 'x' : ' ') + match[3];
                break;
            }
            count++;
        }

        if (indexToReplace !== -1) {
            markdown = markdown.slice(0, indexToReplace) +
                replacement +
                markdown.slice(indexToReplace + match[0].length);
        }

        return markdown;
    }

    adjustPopupTitleWithCheckboxStats(description_new) {
        const title_el = document.querySelector('.popup-wrapper')?.getElementsByClassName('title')[0];
        if (title_el) {
            const cb_stats = this.countMarkdownCheckboxes(description_new);
            const str = title_el.textContent;
            const new_title = str.replace(/\([^)]*\)/, `(${cb_stats['checked']}/${cb_stats['total']})`);
            title_el.textContent = new_title;
        }
    }

    // Popup management
    observePopupHide() {
        if (this.elements.popup_element) {
            const observer = new MutationObserver((mutationsList) => {
                for (const mutation of mutationsList) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        const classList = mutation.target.classList;
                        if (classList.contains('hide')) {
                            if (this.state.popupIsOpen) {
                                console.log('-> Popup closed');
                                this.state.popupIsOpen = false;
                                this.onPopupClose();
                            }
                        } else {
                            if (!this.state.popupIsOpen) {
                                console.log('-> Popup opened');
                                this.state.popupIsOpen = true;
                                this.onPopupOpen();
                            }
                        }
                    }
                }
            });

            observer.observe(this.elements.popup_element, {
                attributes: true,
                attributeFilter: ['class']
            });
            
            this.observers.push(observer);
            console.log("observer created...");
        }
    }

    onPopupClose() {
        console.log('Popup closed...', this.state.checkbox_changed);
        if (this.state.checkbox_changed) {
            this.createGanttChart();
            this.state.checkbox_changed = false;
        }
    }

    onPopupOpen() {
        console.log("Open popup...");
        setTimeout(() => this.setUpHtmlMdToggle(), 500);
    }

    onPopupCloseClicked() {
        console.log("onPopupCloseClicked...");
        const popup = document.querySelector('.popup-wrapper');
        popup.classList.add("hide");
    }

    // Toggle text field in popup
    autoResizeHeight(el) {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 4 + 'px';
    }

    setUpHtmlMdToggle() {
        console.log("setUpHtmlMdToggle...");
        this.elements.htmlBox = document.querySelector('.html_box');
        this.elements.mdBox = document.querySelector('.md_box');
        this.elements.toggleBtn = document.getElementById('toggleBtn');
        this.elements.toggleBtn2 = document.getElementById('toggleBtn2');
		
        if (!this.elements.mdBox || !this.elements.htmlBox) return;
        
        const textarea = this.elements.mdBox.getElementsByTagName('textarea')[0];
        const closeBtn = document.querySelector('.popup-close-button');

        // Toggle to md view
        this.elements.toggleBtn.addEventListener('click', () => {
            this.elements.htmlBox.classList.add('hide');
            this.elements.mdBox.classList.remove('hide');
			this.onHtml2MdToggle();
            this.autoResizeHeight(textarea);
        });

		// Toggle to md view by clicking in the htmlBox
        this.elements.htmlBox.addEventListener('click', (event) => {
            if (event.target.type !== "checkbox") {
                this.elements.htmlBox.classList.add('hide');
                this.elements.mdBox.classList.remove('hide');
				this.onHtml2MdToggle();
                this.autoResizeHeight(textarea);
            }
        });

        // Toggle to html view
        this.elements.toggleBtn2.addEventListener('click', () => {
            this.elements.mdBox.classList.add('hide');
            this.elements.htmlBox.classList.remove('hide');
            this.onMd2HtmlToggle();
        });
        
        // Auto-resize textarea
        textarea.addEventListener('input', () => this.autoResizeHeight(textarea));
        
        closeBtn.addEventListener('click', () => this.onPopupCloseClicked());
    }

    onMd2HtmlToggle() {
        console.log("onMd2HtmlToggle...");
        this.startInteraction();
        
        if (this.elements.mdBox && this.elements.htmlBox) {
            // Get description from textarea
            const textarea = this.elements.mdBox.getElementsByTagName('textarea')[0];
			
			// descriptionn_md is user input and needs to be senetized after converting to html
            let description_md = textarea.value;
            
            // Change html version
            let description_safeHtml = this.createSafeHtml_markdownToHtml(description_md, true, this.elements.htmlBox.id);
            this.elements.htmlBox.getElementsByTagName('span')[0].innerHTML = description_safeHtml;
            
            // Adjust title
            this.adjustPopupTitleWithCheckboxStats(description_md);
            
            // Get card data
            const taskIndex = this.elements.htmlBox.id.split('_')[1];
            const task = this.state.ganttChart.tasks[taskIndex];
            const stackIndex = this.task2stackCardIndex[taskIndex].stack;
            const cardIndex = this.task2stackCardIndex[taskIndex].card;
            const card = this.state.boardData.stacks[stackIndex].cards[cardIndex];
            
            // Change card description
            const description_md_ = this.updateDescriptionDates(description_md, task.start, task.progress);
            card.description = description_md_;
            
            // Send to API
            const stackId = this.state.boardData.stacks[stackIndex].id;
            this.sendCardData(this.state.boardData.id, stackId, card.id, card);
            
            this.state.checkbox_changed = true;
        }
        this.stopInteraction();
    }
    onHtml2MdToggle() {
        console.log("onHtml2MdToggle...");
        this.startInteraction();
        
        if (this.elements.mdBox && this.elements.htmlBox) {
            // Get card data
            const taskIndex = this.elements.htmlBox.id.split('_')[1];
            const stackIndex = this.task2stackCardIndex[taskIndex].stack;
            const cardIndex = this.task2stackCardIndex[taskIndex].card;
            const card = this.state.boardData.stacks[stackIndex].cards[cardIndex];
			            
			// Set textarea content to card description
			// Set value directly - textarea is inherently safe
			let description_md = card.description;
			description_md = this.tuneMarkdown(description_md);
            const textarea = this.elements.mdBox.getElementsByTagName('textarea')[0];
            textarea.textContent = description_md; // this is considered as being inherintly secure in terms of html injection
        }
        this.stopInteraction();
    }

    // Cookie management
    setCookie(name, value, days = 30) {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/';
    }

    getCookie(name) {
        return document.cookie.split('; ').reduce((r, v) => {
            const parts = v.split('=');
            return parts[0] === name ? decodeURIComponent(parts[1]) : r;
        }, '');
    }

    loadSettingsFromCookies() {
        const savedUsername = this.getCookie('username');
        const savedUrl = this.getCookie('url');
        const savedToken = this.getCookie('token');
        
        if (savedUsername) {
            document.getElementById('username').value = savedUsername;
        }
        if (savedUrl) {
            document.getElementById('url').value = savedUrl;
        }
        if (savedToken) {
            document.getElementById('token').value = savedToken;
        }
        
        return !!(savedUsername && savedUrl && savedToken);
    }

    hasStoredCredentials() {
        const savedUsername = this.getCookie('username');
        const savedUrl = this.getCookie('url');
        const savedToken = this.getCookie('token');
        return !!(savedUsername && savedUrl && savedToken);
    }

    toggleSettings(enforceAction = null) {
        const form = document.getElementById('settingsForm');
        const arrow = document.getElementById('arrow');
        
        switch(enforceAction) {
            case 'open':
                this.isFormVisible = false;
                break;
            case 'close':
                this.isFormVisible = true;
                break;
        }
        
        if (this.isFormVisible) {
            form.classList.add('hidden');
            arrow.classList.add('rotated');
        } else {
            form.classList.remove('hidden');
            arrow.classList.remove('rotated');
        }
        
        this.isFormVisible = !this.isFormVisible;
    }

    handleSubmit(event) {
        event.preventDefault();
        
        // Save to cookies if checked
        if (document.getElementById('storeCookies').checked) {
            const formData = new FormData(event.target);
            this.setCookie('username', formData.get('username'));
            this.setCookie('url', formData.get('url'));
            this.setCookie('token', formData.get('token'));
        } else {
            console.log("Cookies not accepted");
        }
        
        this.fetchBoards();
    }
}

// Singleton pattern
NCGantt.instance = null;
NCGantt.getInstance = function() {
    if (!NCGantt.instance) {
        NCGantt.instance = new NCGantt();
    }
    return NCGantt.instance;
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Create global instance for debugging
    window.ncGantt = NCGantt.getInstance();
    window.ncGantt.init();
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (window.ncGantt) {
        window.ncGantt.destroy();
    }
});