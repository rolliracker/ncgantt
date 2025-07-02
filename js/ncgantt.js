//"use strict";

    // <!-- Gantt Chart section --> 
		function isInsideNextcloud() {
			// Check for OC/OCA globals
			if (typeof OC !== 'undefined' || typeof OCA !== 'undefined') {
				return true;
			}
			// Check URL patterns
			if (window.location.pathname.includes('/apps/')) {
				return true;
			}
			// Check for Nextcloud DOM elements
			if (document.querySelector('#body-user, #body-public, .nc-')) {
				return true;
			}
			return false;
		}
			
		const isNextcloud = isInsideNextcloud()
		document.addEventListener('DOMContentLoaded', function() {
			// All your gantt chart initialization code here
			setupEventListeners();
			setupEnvironment(isNextcloud);
			console.log("fdsafdsaafdsa 1");
		});

		function setupEventListeners() {
			let el = document.getElementById('settingsHeader');
			el.onclick = toggleSettings;
			
			el = document.getElementById('settingsForm');
			el.onsubmit = handleSubmit;

			el = document.getElementById('boardSelect');
			el.onchange = fetchBoardData;
			
			// Listen to checkbox click events
			document.addEventListener('change', function(event) {
				// Check if the clicked element is one of your checkboxes
				if (event.target.classList.contains('description_checkboxes')) {
					handleCheckboxClicked(event.target);
				}
			});
		}	
		function setupEnvironment(nextcloud) {
			console.log("fdsafdsaafdsa 2");
			if (nextcloud) {
				let el = document.getElementById('settingsContainer');
				el.classList.add("hidden");
				
			} else {
				let el = document.getElementById('settingsContainer');
				el.classList.remove("hidden");
			}
			
			if (nextcloud) {
				adjustNextcloudStyle();
			}
		}
		function adjustNextcloudStyle() {
			console.log("fdsafdsaafdsa 3");
			const container = document.getElementById('content');
			if (container) {
				console.log("Change position of the content element");
				container.style.top = '0';
				container.style.left = '8px';
				container.style.marginLeft = '0px';
			}
			else {
				console.log("Content element does not exist!!!");
			}			
		}
		console.log("Try now !!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
		adjustNextcloudStyle(); // try to do it emidiately
	
		let chart_options = {
			'bar_height': 20,
		};
	
        let ganttChart = null;
        let boardData = null;
        const stackColors = {};
        const colorPalette = [
            '#52ba52', '#5ca5d7', '#ff7f0e', '#ad91c6',
            '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
			// , '#de6162'
        ];
		
		// Interval for regular updates
		let update_timer_interval = 2000;  // in ms
		let update_blocking_delay = 2100;  // this time after last user interaction updating remains blocked
		
		// get popup element to be able to track hide events of the popup
		let popup_element = null;
		let popupIsOpen = false;
		let checkbox_changed = false;
		
		let task2stackCardIndex = [];
		let enforceRefreshAfterInteraction = false;
		
		// monitor network state
		let isOnline = window.navigator.onLine;
		window.addEventListener('online', () => {isOnline=true; showSuccess("You are online")});
		window.addEventListener('offline', () => {isOnline=false; showError("You are offline")});
        
        function showStatus(message, type = 'info') {
            const statusEl = document.getElementById('status');
            statusEl.className = type;
            statusEl.textContent = message;
        }
        
        function showError(message) {
            showStatus(message, 'error');
        }
        
        function showSuccess(message) {
            showStatus(message, 'success');
        }
        
        async function makeApiCall(endpoint, method = 'GET', body = null) {
			if(!window.navigator.onLine) {
				console.log("No internet connection!");
				throw new Error('You are offline');
			}
		
			let apiUrl = '';
			let options = {};
			
			if (isNextcloud) {
				apiUrl = OC.generateUrl(`/apps/deck/api/v1.0${endpoint}`);

				options = {
					method: method,
					headers: {
						'OCS-APIRequest': 'true',
						'requesttoken': OC.requestToken,
						'Content-Type': 'application/json'
					}
				};	
			}
			else {
				const url = document.getElementById('url').value.trim();
				const username = document.getElementById('username').value.trim();
				const token = document.getElementById('token').value.trim();
				
				if (!url || !username || !token) {
					throw new Error('Please enter all settings');
				}
				
				// Normalize URL
				const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
				apiUrl = `${baseUrl}/index.php/apps/deck/api/v1.0${endpoint}`;
				
				options = {
					method: method,
					headers: {
						'Authorization': 'Basic ' + btoa(username + ':' + token),
						'Accept': 'application/json',
						'Content-Type': 'application/json'
					}
				};
			}
            
			// convert options map to json
			if (body && method !== 'GET') {
				options.body = JSON.stringify(body);
			}
			//console.log("body", body);
			//console.log("options", options);
			
			const response = await fetch(apiUrl, options);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Response:', errorText);
                throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
            }
            
            return await response.json();
        }
        
        async function fetchBoards() {
            const btn = document.getElementById('loadBoardsBtn');
            btn.disabled = true;
			toggleSettings('close');            
            showStatus('Loading boards...', 'loading'); 
			console.log('Loading boards...');

            try {
                const boards = await makeApiCall('/boards');
                
                const select = document.getElementById('boardSelect');
                select.innerHTML = '<option value="">-- please select --</option>';
                
                boards.forEach(board => {
                    const option = document.createElement('option');
                    option.value = board.id;
                    option.textContent = board.title;
                    select.appendChild(option);
                });
                
                document.getElementById('boardSelection').style.display = 'block';
                showSuccess(`${boards.length} Board(s) found`);
				
				// Hide the form
				toggleSettings('close');
            } catch (error) {
                showError(error.message);
				toggleSettings('open');
            } finally {
                btn.disabled = false;
				console.log("...Loading boards done!");
            }
        }
        
		async function fetchBoardData() {
			console.log("fetchBoardData...")
			showStatus('Fetch board data...', 'loading');

			const boardId = document.getElementById('boardSelect').value;
			if (!boardId) return;
						
			try {
				// Fetch board data
				boardData = await makeApiCall(`/boards/${boardId}`);
								
				const completeStacksData = await makeApiCall(`/boards/${boardId}/stacks`);
				boardData.stacks = completeStacksData;
				
				// Sort stacks --->
				if (boardData.stacks.length ) {
					let stack_order_index = {};
					let order_numbers = [];
					let stacks_sorted = [];
					boardData.stacks.forEach((stack, stackIndex) => {
						stack_order_index[stack.order] = stackIndex;
						order_numbers.push(stack.order);
					});	
						
					// check for duplicates in order_numbers -> in this case, sorting is not done
					const has_duplicates = new Set(order_numbers).size !== order_numbers.length;
					
					if(!has_duplicates) {
						// sort by order number
						order_numbers.sort().reverse().forEach((order, index) => {
							stack = boardData.stacks[stack_order_index[order]];
							stacks_sorted.push(stack);
						});
						boardData.stacks = stacks_sorted;
						console.log("Sorted stacks by order number");
					}
					else {
						console.log("Sorting stacks cannot be done (duplicate order numbers)", order_numbers);
					}
				}
				// <---
				
				// get last modification date (used for the periodic updates):
				update_lastModified = boardData['lastModified'];

				showSuccess('Board data loaded');
				createGanttChart();
				
			} catch (error) {
				showError(error.message);
			}
		}
        
        async function sendCardData(boardId, stackId, cardId, card) {
			console.log("sendCardData...");
            try {
                showStatus('Updating card...', 'loading');
                const endpoint = `/boards/${boardId}/stacks/${stackId}/cards/${cardId}`;
				
                const result = await makeApiCall(endpoint, 'PUT', card);
                
                showSuccess('Updated card successfully');
                return result;
            } catch (error) {
                showError('Error while updating card: ' + error.message);
                throw error;
            }
        }

        function createGanttChart() {
			console.log("createGanttChart...");
            if (!boardData || !boardData.stacks) {
                showError('No board data available');
                return;
            }
            
            const tasks = [];
			let taskIndex = 0;
            let colorIndex = 0;
			task2stackCardIndex = [];
			let stackNum = 0;
			let cardNum = 0;
		
            // create tasks from all cards in a stack
			
			// iterate over all stacks
            boardData.stacks.forEach((stack, stackIndex) => {
                
                // asign a color to each stack
                stackColors[stack.id] = colorPalette[colorIndex % colorPalette.length];
                colorIndex++;
                
				// iterate over all cards
                if (stack.cards && stack.cards.length > 0) {
                    stack.cards.forEach((card, cardIndex) => {
                        // console.log('Verarbeite Karte:', card);
                        const { start, end, progress } = getCardDates(card);
                        
						// remove empty list items in original markdown
						card.description = removeEmptyListItems(card.description);
						
						let description_md = card.description;
						description_md = removeEmptyListItems(description_md);
						description_md = tuneMarkdown(description_md); // remove Start and Progress
						description_html = markdownToHtml(description_md, true, "t_"+taskIndex); // using own markdown converter handling all list types						
						description_html = tuneHtmlPopup(description_html, description_md, "t_"+taskIndex);
						
                        tasks.push({
                            id: `card-${card.id}`,
                            name: createTaskName(card), // Create task name with labels,
                            start: start,
                            end: end,
                            progress: progress || 0,
							color: stackColors[stack.id],
							color_progress: '#cfcfcfa3',
                            dependencies: '',
                            custom_class: `stack-${stack.id}`,
                            stack: stack.title,
                            description: description_html || '',
                            overdue: card.overdue || 0,
                            cardId: card.id,
                            stackId: stack.id,
                            labels: card.labels || [],
							//dependencies: 'Wasser: Teile besorgen'				
                        });
						task2stackCardIndex.push({'stack':stackIndex, 'card':cardIndex});
						taskIndex++;
                    });
                }
            });
            
            // console.log('Erstellte Tasks:', tasks.length, tasks);
                        
            // Container vorbereiten
            const container = document.getElementById('gantt-container');
            container.innerHTML = '<svg id="gantt"></svg>';
			
            if (tasks.length === 0) {
                showError('No cards found');
				if (ganttChart) {
					ganttChart.refresh([]);	
					ganttHeightManager.fixGanttHeight();
				}
                return;
            }

            
            try {
                // Gantt Chart erstellen
                ganttChart = new Gantt('#gantt', tasks, {
                    view_mode: 'Week',
                    date_format: 'YYYY-MM-DD',
                    view_mode_select: true,
                    language: 'de',
					bar_height: 22,
					padding: 16,
					scroll_to: 'start',
                    popup_trigger: 'click',
						
					/* // custom pupup -->		
                    custom_popup_html: function(task) {
                        const startDateStr = task.start.toLocaleDateString('de-DE');
                        const endDateStr = task.end.toLocaleDateString('de-DE');
                        const descPreview = task.description ? 
                            task.description.replaceAll.split('\n')
                                .filter(line => !line.match(/^(?:Start|Startdatum|Progress|Fortschritt):/i))
                                .join('<br>\n')
                                .substring(0, 100) : '';
                        
                        // Create labels HTML
                        let labelsHtml = '';
                        if (task.labels && task.labels.length > 0) {
                            labelsHtml = '<p><strong>Labels:</strong> ';
                            labelsHtml += task.labels.map(label => 
                                `<span style="background-color: #${label.color}; color: white; padding: 2px 6px; border-radius: 3px; margin-right: 4px; font-size: 12px;">${label.title}</span>`
                            ).join('');
                            labelsHtml += '</p>';
                        }
						
                        return `
                            <div class="details-container">
                                <h5>${task.name}</h5>
                                <p><strong>Stack:</strong> ${task.stack}</p>
                                <p><strong>Start:</strong> ${startDateStr}</p>
                                <p><strong>Fälligkeit:</strong> ${endDateStr}</p>
                                <p><strong>Fortschritt:</strong> ${task.progress}%</p>
                                ${task.overdue ? '<p style="color: red;"><strong>Überfällig!</strong></p>' : ''}
                                ${labelsHtml}
                                ${descPreview ? '<p><strong>Beschreibung:</strong> ${descPreview}...</p>' : ''}
                            </div>
                        `;
                    }, 
					// <-- */
					
                    on_date_change: async function(task, start, end) {
						console.log("on_date_change...");
                        try {
							const taskIndex = tasks.indexOf(task);
							const stackIndex = task2stackCardIndex[taskIndex].stack
							const cardIndex  = task2stackCardIndex[taskIndex].card
                            const card = boardData.stacks[stackIndex].cards[cardIndex];
							
                            // Update description with new start date
                            const description_new = updateDescriptionDates(card.description, start, task.progress);
                            
                            // Change card object
							card.description = description_new;
							card.duedate = end.toISOString();							
                            
                            // Send update to Deck API
                            await sendCardData(boardData.id, task.stackId, task.cardId, card);
                            
                            // Update local task data
							task.start = start;
                            task.end = end;
							
							task.name = createTaskName(card);
							refreshTitle = {
								taskIndex: taskIndex,
								taskName: task.name
							}
							
                        } catch (error) {
                            console.error('Error while updating dates:', error);
                            showError('Error while updating dates: ' + error.message);
                            // Optionally reload to revert changes
                            // fetchBoardData();
                        }
                    },
                    on_progress_change: async function(task, progress) {
                        try {					
                            // Get current card data to preserve all fields
							const taskIndex = tasks.indexOf(task);
							const stackIndex = task2stackCardIndex[taskIndex].stack
							const cardIndex  = task2stackCardIndex[taskIndex].card
                            const card = boardData.stacks[stackIndex].cards[cardIndex];
                            
                            // Update description with new progress
                            const updatedDescription = updateDescriptionDates(card.description,task.start,progress);
							
							// mark as complete if progress = 100%
							let doneFieldChanged = false;
							if (task.progress == 100) {
								if (!card.done) {
									const d = new Date();
									card.done = d.toISOString();
									doneFieldChanged = true;
								}
							} else if (card.done) {
								card.done = null;
								doneFieldChanged = true;
							}
                            
                            // change card object
                            card.description = updatedDescription;
                            
                            // Send update to Deck API
                            await sendCardData(boardData.id, task.stackId, task.cardId, card);
                            
							if (doneFieldChanged) {
								task.name = createTaskName(card);
								ganttChart.refresh(tasks);
								ganttHeightManager.fixGanttHeight();
							}
                            
                        } catch (error) {
                            console.error('Error while updating dates:', error);
                            showError('Error while updating progress: ' + error.message);
                        }
                    }
                });
                
                displayStackColors();  // display stack color legend
				displayLabels(); // Add labels section to legend
                
                showSuccess(`Created Gantt chart with ${tasks.length} cards`);
            } catch (error) {
                console.error('Error while creating the Gantt chart:', error);
                showError('Error while creating the Gantt chart: ' + error.message);
            }
			
			// tune gantt after creation --->
			// Handle height management for the recreated gantt
			ganttHeightManager.fixGanttHeight();
			
			startUpdateEventListener(); // for pausing updates during user interaction
			
			// add separators between stacks
			let stackId_last = tasks[0].stackId;
			tasks.forEach((task, taskIndex) => {
				if (task.stackId != stackId_last) {
					document.getElementsByClassName('row-line')[taskIndex-1].style.stroke = '#c4c4c4';
					stackId_last = task.stackId;
				}
			});
			// <---
			
			// get popup element to be able to track hide events of the popup
			popup_element = document.querySelector('.popup-wrapper');
			observe_popup_hide();			
        }
		
		function createTaskName(card){
			let taskName = card.title;
			
			taskName +=  `<tspan dy='-2'>`;

			checkboxes_stats = countMarkdownCheckboxes(card.description);
			if (checkboxes_stats['total']) {
				taskName += ` &nbsp;<tspan font-weight='bold'>(${checkboxes_stats['checked']}/${checkboxes_stats['total']})</tspan>`;
			}

			let checkedTag = '';
			if (card.done) {
				checkedTag = " &#9989;";
			} else if (card.duedate) {
				const currentDate = new Date();
				const dueDate = new Date(card.duedate);
				//console.log(currentDate, dueDate);
				if (dueDate < currentDate) {
					//console.log(" DELAYED");
					checkedTag = ` &nbsp;<tspan fill='red' font-size='16px' font-weight='bold'>!</tspan>`;
				}
			}				
			taskName += `${checkedTag}`;
			
			if (card.labels && card.labels.length > 0) {
				const labelTags = card.labels.map(label => `<tspan fill='#${label.color}' font-weight='bold'>[${label.title}]</tspan>`).join(' ');	
				taskName += ` &nbsp;${labelTags}`;
			}
			taskName +=  `</tspan>`;
			return taskName;
		}

		// handle Dates and Progress fields ---->
        function parseDateProgressFromDescription(description) {
            if (!description) return { startDate: null, progress: 0 };
            
            const lines = description.split('\n');
            let startDate = null;
            let progress = 0;
            
            for (const line of lines) {
		        // Parse Start date (various formats)
                const startMatch = line.match(/^(?:Start|Startdatum|Begin):\s*(.+)$/i);
                if (startMatch) {
		            const dateStr = startMatch[1].trim();
                    // Try to parse different date formats
                    const parsed = parseDate(dateStr);
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
        
        function parseDate(dateString) {
            if (!dateString) return null;
		                
            // Try German format (DD.MM.YYYY)
            const germanMatch = dateString.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
            if (germanMatch) {
                let date = new Date(germanMatch[3], germanMatch[2] - 1, germanMatch[1]);
	            if (!isNaN(date.getTime())) return date;
            }
            
            // Try other common formats
            // MM/DD/YYYY or MM-DD-YYYY
            const usMatch = dateString.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
            if (usMatch) {
                let date = new Date(usMatch[3], usMatch[1] - 1, usMatch[2]);
                if (!isNaN(date.getTime())) return date;
            }
            
            // Try ISO format first
            let date = new Date(dateString);
            if (!isNaN(date.getTime())) return date;

            return null;
        }
        
        function getCardDates(card) {
            let start = null;
            let end = null;
            
            // Parse start date and progress from description
            const { startDate, progress } = parseDateProgressFromDescription(card.description);
            
            // Use parsed start date if available
            if (startDate) {
                start = startDate;
                // console.log('Startdatum aus Beschreibung gefunden:', start);
            }
            
            // Use duedate as end date
            if (card.duedate) {
                end = parseDate(card.duedate);
            }
            
			const default_interval = 12; // hours, default interval for cards with missing start or end date
			
            // If we have end but no start, set start 1 day before
            if (end && !start) {
                start = new Date(end);
                //start.setDate(start.getDate() - default_interval);
                start.setHours(start.getHours() - default_interval);
            }
            
            // If we have start but no end, set end 1 days after
            if (start && !end) {
                end = new Date(start);
                //end.setDate(end.getDate() + default_interval);
                end.setHours(end.getHours() + default_interval);
            }
            
            // Last resort: use today
            if (!start || !end) {
                start = new Date();
                end = new Date();
                //end.setDate(end.getDate() + default_interval);
                end.setHours(end.getHours() + default_interval);
            }
            
            return { start, end, progress };
        }
		
        function formatDateForUpdate(date) {
            // Format date for description (German format)
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${day}.${month}.${year}`;
        }
        
        function updateDescriptionDates(description, newStart, newProgress) {
            if (!description) {
                description = '';
            }
            
            const lines = description.split('\n');
            let foundStart = false;
            let foundProgress = false;
            const newLines = [];
            
            // Update existing lines or track what's missing
            for (const line of lines) {
                if (line.match(/^(?:Start|Startdatum|Begin):/i)) {
                    newLines.push(`Start: ${formatDateForUpdate(newStart)}`);
                    foundStart = true;
                } else if (line.match(/^(?:Progress|Fortschritt):/i)) {
                    newLines.push(`Progress: ${newProgress}%`);
                    foundProgress = true;
                } else {
                    newLines.push(line);
                }
            }
            
            // Add missing fields at the beginning
            const toInsert = [];
            if (!foundStart) {
                toInsert.push(`Start: ${formatDateForUpdate(newStart)}`);
            }
            if (!foundProgress) {
                toInsert.push(`Progress: ${newProgress}%`);
            }
            
            if (toInsert.length > 0) {
                // Add separator if there's existing content
                if (newLines.length > 0 && newLines[0].trim() !== '') {
                    toInsert.push('');
                }
                return [...toInsert, ...newLines].join('\n');
            }
            
            return newLines.join('\n');
        }
		// <---- handle Dates and Progress fields
        
		// markdown section ---->
		function removeEmptyListItems(markdown) {
		  // Split the markdown into lines
		  const lines = markdown.split('\n');
		  
		  // Filter out lines that are empty list items
		  const filteredLines = lines.filter(line => {
			// Check for empty list items with any amount of leading whitespace
			// This regex matches indentation (spaces/tabs) followed by list markers
			
			// Check for empty checkbox items: - [ ] or - [x] with no content after
			const emptyCheckboxPattern = /^[\s\t]*[-*+]\s*\[[x\s]?\]\s*$/i;
			if (emptyCheckboxPattern.test(line)) {
			  return false;
			}
			
			// Check for empty regular list items: -, *, or + with no content after
			const emptyListPattern = /^[\s\t]*[-*+]\s*$/;
			if (emptyListPattern.test(line)) {
			  return false;
			}
			
			// Check for empty numbered list items: 1., 2., etc. with no content after
			const emptyNumberedPattern = /^[\s\t]*\d+\.\s*$/;
			if (emptyNumberedPattern.test(line)) {
			  return false;
			}
			
			// Keep all other lines
			return true;
		  });
		  
		  // Join the filtered lines back together
		  return filteredLines.join('\n');
		}
		
        function markdownToHtml(markdown, interactive=false, parent_id='') {
            const lines = markdown.split('\n');
            const result = [];
            const stack = []; // Stack to track open list elements at each level
            let currentLevel = -1;
            
            // Helper to calculate indentation level (assumes 2 spaces or 1 tab)
            function getIndentLevel(line) {
                const match = line.match(/^(\s*)/);
                if (!match) return 0;
                const spaces = match[1];
                // Count tabs as 2 spaces
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
            
            // Helper to close lists down to a certain level
            function closeLists(targetLevel) {
                while (currentLevel > targetLevel) {
                    const listType = stack.pop();
                    result.push(`</${listType}>`);
                    currentLevel--;
                }
            }
            
            // Helper to escape HTML and convert markdown formatting
            function escapeHtml(text) {
                const map = {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#039;'
                };
                
                // First escape HTML characters
                let escaped = text.replace(/[&<>"']/g, m => map[m]);
                
                // Then convert markdown formatting
                // Bold: **text** or __text__
                escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                escaped = escaped.replace(/__([^_]+)__/g, '<strong>$1</strong>');
                
                // Italic: *text* or _text_ (but not if it's part of bold)
                escaped = escaped.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
                escaped = escaped.replace(/(?<!_)_(?!_)([^_]+)(?<!_)_(?!_)/g, '<em>$1</em>');
                
                return escaped;
            }
            
			let checkbox_count=0;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                if (!line.trim()) {
                    // Empty line - close all lists but track consecutive empties
                    if (currentLevel >= 0) {
                        closeLists(-1);
                    }
                    
                    // Count consecutive empty lines
                    let emptyCount = 1;
                    let j = i + 1;
                    while (j < lines.length && !lines[j].trim()) {
                        emptyCount++;
                        j++;
                    }
                    
                    // If there's a non-list item following, add extra breaks
                    if (j < lines.length && !parseListItem(lines[j])) {
                        if (emptyCount > 1) {
                            result.push('<br>'.repeat(emptyCount - 1));
                        }
                    }
                    
                    // Skip the empty lines we just processed
                    i = j - 1;
                    continue;
                }
                
                const indent = getIndentLevel(line);
                const listItem = parseListItem(line);
                
                if (listItem) {
                    // Determine the list type we need
                    const needsList = listItem.type === 'checkbox' || listItem.type === 'ul' ? 'ul' : 'ol';
                    
                    // If we're at a shallower level, close deeper lists
                    if (indent < currentLevel) {
                        closeLists(indent);
                    }
                    
                    // Check if we need to open a new list
                    if (indent > currentLevel) {
                        // Opening a new nested level
                        result.push(`<${needsList}>`);
                        stack.push(needsList);
                        currentLevel = indent;
                    } else if (indent === currentLevel && stack[stack.length - 1] !== needsList) {
                        // Same level but different list type - close current and open new
                        closeLists(indent - 1);
                        result.push(`<${needsList}>`);
                        stack.push(needsList);
                        currentLevel = indent;
                    }
                    // If same level and same type, just add the item
                    
                    // Collect content for this list item
                    let contentParts = [escapeHtml(listItem.content)];
                    
                    // Look ahead for continuation lines
                    let j = i + 1;
                    while (j < lines.length && lines[j].trim() !== '') {
                        const nextLine = lines[j];
                        const nextIndent = getIndentLevel(nextLine);
                        const nextListItem = parseListItem(nextLine);
                        
                        // If it's not a list item and has greater or equal indentation, it's a continuation
                        if (!nextListItem && nextIndent >= indent) {
                            contentParts.push(escapeHtml(nextLine.trim()));
                            i = j; // Skip this line in the main loop
                            j++;
                        } else {
                            break;
                        }
                    }
                    
                    // Join content parts with <br> tags
                    const fullContent = contentParts.join('<br>');
                    
                    // Add the list item
                    if (listItem.type === 'checkbox') {
                        const disabled = interactive ? '' : ' disabled';
                        result.push(`<li><input type="checkbox"${listItem.checked ? ' checked' : ''}${disabled} class="description_checkboxes" id="${parent_id}_${checkbox_count}"> ${fullContent}</li>`);
						checkbox_count++;
                    } else {
                        result.push(`<li>${fullContent}</li>`);
                    }
                } else {
                    // Regular text - close all lists first
                    closeLists(-1);
                    
                    // Collect consecutive lines of regular text
                    let paragraphLines = [escapeHtml(line.trim())];
                    let j = i + 1;
                    
                    // Look ahead for continuation lines (single line break)
                    while (j < lines.length) {
                        // If we hit an empty line, stop
                        if (!lines[j].trim()) {
                            break;
                        }
                        
                        // If it's a list item, stop
                        if (parseListItem(lines[j])) {
                            break;
                        }
                        
                        // Otherwise, it's a continuation of the paragraph
                        paragraphLines.push(escapeHtml(lines[j].trim()));
                        i = j; // Skip this line in the main loop
                        j++;
                    }
                    
                    // Join paragraph lines with <br> tags
                    const paragraphContent = paragraphLines.join('<br>');
                    result.push(`<p>${paragraphContent}</p>`);
                    
                    // Check for consecutive empty lines after this paragraph
                    let extraBreaks = 0;
                    let k = i + 1;
                    while (k < lines.length && lines[k].trim() === '') {
                        extraBreaks++;
                        k++;
                    }
                    
                    if (extraBreaks > 1) {
                        // Add extra <br> tags for multiple empty lines
                        result.push('<br>'.repeat(extraBreaks - 1));
                    }
                    
                    // Skip the empty lines we just processed
                    if (extraBreaks > 0) {
                        i = k - 1;
                    }
                }
            }
            
            // Close any remaining open lists
            closeLists(-1);
            
            return result.join('\n');
        }
				
		function tuneMarkdown(mdText) {
			const searchPattern_exclude  = /^(?:Start|Startdatum|Progress|Fortschritt):/i;
			// remove lines to be excluded:
			mdText = mdText.replaceAll('\n\n\n', '\n\n');
			mdText = mdText.split('\n').filter(line => !line.match(searchPattern_exclude)).join('\n');
			return mdText;
		}
		
		function tuneHtmlPopup(html, markdown, parent_id='') {
			const md_lines = markdown.split('\n');
			const md_rows = Math.max(md_lines.length + 1,3);
			const md_lineLength_max = md_lines.reduce((max, str) => Math.max(max, str.length), 0);
			const md_cols = Math.min(md_lineLength_max, 60);
			html = `<div class="html_box" id="${parent_id}"><span>
						${html}</span>
						<span class="html-md-icon-toggle" id="toggleBtn">✏️</span>
					</div>
					<div class="md_box hide">
						<textarea class="md_textarea" rows="${md_rows}" cols="${md_cols}">${markdown}</textarea>
						<span class="html-md-icon-toggle" id="toggleBtn2">✅</span>
					</div>`;

			html = html.replace(/^<br\s*\/?>/, '');  // Remove <br> only if it's at the start

			// add horizontal line at the end only if a description exists
			if( html.replaceAll('\n','').replaceAll(' ','').length ) {
				html += '<hr style="border: 1px solid #e9e9e9; margin-top: 10px;margin-bottom: 6px;">';
			}
			// add horizontal line at the beginning
			html = '<hr style="border: 1px solid #e9e9e9; margin-top: 6px;margin-bottom: 10px;">' + html;
			
			html = html.replaceAll('<br><br>', '<br>');
				
			html = '<div id="htmlOutput">' + html;
			html += '</div>';
			
			return html;
		}
		
		function countMarkdownCheckboxes(markdownString) {
		  // Regex to match all checkbox patterns: - [ ], * [ ], + [ ], - [x], etc.
		  // Supports various list markers (-, *, +) and checkbox states (space, x, X)
		  const checkboxRegex = /^[\s]*[-*+]\s*\[(.?)\]/gm;
		  
		  const matches = [...markdownString.matchAll(checkboxRegex)];
		  const totalCheckboxes = matches.length;
		  
		  // Count checked checkboxes (x, X, or other non-space characters)
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
		// <---- markdown section
                
        function displayStackColors() {
            const container = document.getElementById('gantt-container');
            const colorDiv = document.createElement('div');
            colorDiv.className = 'stack-colors';
            
            boardData.stacks.forEach(stack => {
                if (stack.cards && stack.cards.length > 0) {
                    const indicator = document.createElement('div');
                    indicator.className = 'stack-indicator';
                    indicator.innerHTML = `
                        <div class="color-box" style="background-color: ${stackColors[stack.id]}"></div>
                        <span>${stack.title}</span>
                    `;
                    colorDiv.appendChild(indicator);
                }
            });           
            container.appendChild(colorDiv);
        }
        
        function displayLabels() {
            // Collect all unique labels
            const allLabels = new Map();
            boardData.stacks.forEach(stack => {
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
                    indicator.innerHTML = `
                        <span class="color-box" style="background-color: #${label.color}"></span>
                        <span>${label.title}</span>
                    `;
                    labelDiv.appendChild(indicator);
                });
                
                labelSection.appendChild(labelDiv);
                container.appendChild(labelSection);
            }
        }
		
		// regular updates ---->
		let update_lastModified = null;
		
		// Pause updates during user interaction --->
		let isUserInteracting = false;
		let isUserInteracting_delayed = false;
		let enforceUpdateAfterInteraction = false;
		let interactionTimeout;
		let refreshTitle = null;

		function startInteraction() {
			console.log("startInteraction");
			isUserInteracting = true;
			isUserInteracting_delayed = true;
			clearTimeout(interactionTimeout);
		}
		function stopInteraction() {
			console.log("stopInteraction");
			clearTimeout(interactionTimeout);
			isUserInteracting = false;

			if (refreshTitle) {
				console.log('Refresh Title ...');
				const taskIndex = refreshTitle.taskIndex;
				const taskName = refreshTitle.taskName;
				document.getElementsByClassName('bar-label')[taskIndex].innerHTML=taskName;
				refreshTitle = null;
			}
			
			// delayed deactivation in case the user is pausing for a short time
			interactionTimeout = setTimeout(() => {
				console.log("isUserInteracting = false");
				isUserInteracting_delayed = false;
				if (enforceUpdateAfterInteraction) {
					checkRemoteBoardUpdates(true);
					enforceUpdateAfterInteraction = false;
				}		
			}, update_blocking_delay); 
		}
		function startUpdateEventListener() {
			const ganttElement = document.querySelector('.gantt'); // Passe ggf. den Selektor an
			if(ganttElement){
				ganttElement.addEventListener('mousedown', startInteraction);
				//ganttElement.addEventListener('mousemove', startInteraction);
				window.addEventListener('mouseup', stopInteraction);

				// Optional: Auch Touch-Events abfangen
				ganttElement.addEventListener('touchstart', startInteraction);
				window.addEventListener('touchend', stopInteraction);
			}
		}
		// <---
		
		async function checkRemoteBoardUpdates(enforce=false) {
			//console.log("Check for updates...");	
			if(enforce) console.log("enforced board update...");

			try {
				// get boardId from user settings
				const boardId = document.getElementById('boardSelect').value;
				if (!boardId) { 
					//console.log('... no board selected');
					return;
				}
				
				// get last modification date
				let plainBaordData = await makeApiCall(`/boards/${boardId}`);
				let update_lastModified_new = plainBaordData['lastModified'];			

				// do not update when popup is open or user is interacting, unless enforce==true
				if((popupIsOpen || isUserInteracting_delayed) && !enforce) { 
					update_lastModified = update_lastModified_new;
					return;
				}

				// fetch full board data from API:
				if(enforce || update_lastModified_new > update_lastModified){ 
					fetchBoardData();
					update_lastModified = update_lastModified_new;
				}
			} catch (error) {
				showError(error.message);
			}
			
		}
	    setInterval(checkRemoteBoardUpdates, update_timer_interval);
		// <---- regular updates
		
		// handel changes by user ---->
        async function handleCheckboxClicked(checkbox) {
			console.log("handleCheckboxClicked...");
			startInteraction(); // the mousedown on the checkboxes is not caught by the event handler

			// get checkbox state
			const checked = checkbox.checked;
			
			// get indicees and card object
			const taskIndex  = checkbox.id.split("_")[1];
			const checkbox_num = checkbox.id.split("_")[2];
			const stackIndex = task2stackCardIndex[taskIndex].stack;
			const cardIndex  = task2stackCardIndex[taskIndex].card;
			
			// get card from boardData (master)
			const card = boardData.stacks[stackIndex].cards[cardIndex];

			// change current card description
			let description_md = card.description;
			description_md = setCheckboxState(description_md, checkbox_num, checked);
			card.description = description_md;	

			// adjust title with the new checkbox stats:
			adjustPopupTitleWithCheckboxStats(description_md);
			
			// adjust markdown textarea (md_box):
			if (mdBox) {
				const textarea = mdBox.getElementsByTagName('textarea')[0];
				description_md = tuneMarkdown(description_md); // remove Start and Progress
				textarea.textContent = description_md;
			}
			
			// send to API:
			const stackId = boardData.stacks[stackIndex].id;
			sendCardData(boardData.id, stackId, card.id, card);
			
			// let gantt rebuild when the popup is closed
			checkbox_changed = true; 
	
			stopInteraction();
        }
		function setCheckboxState(markdown, n, checked = true) {
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
			markdown =
				markdown.slice(0, indexToReplace) +
				replacement +
				markdown.slice(indexToReplace + match[0].length);
			}

			return markdown;
		}
				
		// adjust title with the new checkbox stats
		function adjustPopupTitleWithCheckboxStats(description_new){
			const title_el = document.querySelector('.popup-wrapper').getElementsByClassName('title')[0];
			if (title_el) {
				//console.log(title_el.textContent);
				const cb_stats = countMarkdownCheckboxes(description_new);
				//console.log(cb_stats);
				const str = title_el.textContent;
				const new_title = str.replace(/\([^)]*\)/, `(${cb_stats['checked']}/${cb_stats['total']})`);
				//console.log(new_title);
				title_el.textContent = new_title;
			}
		}

		function observe_popup_hide(){
			if (popup_element) {
				const observer = new MutationObserver((mutationsList) => {
					for (const mutation of mutationsList) {
						if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
							const classList = mutation.target.classList;
							//console.log('popupIsOpen', popupIsOpen);
							if (classList.contains('hide')) {
								if (popupIsOpen) {
									console.log('-> Popup closed');
									popupIsOpen = false;
									onPopupClose(); 
								}
							} else {
								if (!popupIsOpen) {
									console.log('-> Popup opened');
									popupIsOpen = true;
									onPopupOpen(); 
								}
							}
						}
					}
				});

				observer.observe(popup_element, {
					attributes: true,
					attributeFilter: ['class']
				});
				console.log("observer created...");
			}
		}

		function onPopupClose() {
			//console.log('Run something after popup closes!', checkbox_changed);
			if (checkbox_changed) {
				createGanttChart(); // is more reactive for checkbox changes, but not yet working for md text changes, because the md text ist not updated in the baordData
				checkbox_changed = false;
			}
		}
		function onPopupOpen() {
			const timeout = setTimeout(setUpHtmlMdToggle, 500); // delay the setup to give the elements time to be build
		}
	
		// toggle text field in popup --->
		let htmlBox;
		let mdBox;
		let toggleBtn;
		let toggleBtn2;

		function setUpHtmlMdToggle() {
			console.log("setUpHtmlMdToggle...");
			htmlBox = document.querySelector('.html_box');
			mdBox = document.querySelector('.md_box');
			toggleBtn = document.getElementById('toggleBtn');
			toggleBtn2 = document.getElementById('toggleBtn2');

			toggleBtn.addEventListener('click', () => {
			  htmlBox.classList.add('hide');
			  mdBox.classList.remove('hide');
			});

			toggleBtn2.addEventListener('click', () => {
			  mdBox.classList.add('hide');
			  htmlBox.classList.remove('hide');
			  onMd2HtmlToggle();
			});
		}
		function onMd2HtmlToggle() {
			console.log("onMd2HtmlToggle...");
			startInteraction();
			//mdBox = document.querySelector('.md_box');
			//htmlBox = document.querySelector('.html_box');
			if (mdBox && htmlBox) {
				// get description as markdown from textarea 
				const textarea = mdBox.getElementsByTagName('textarea')[0];
				let description_md = textarea.value;
				
				// change html version of the description
				let description_html = markdownToHtml(description_md, true, htmlBox.id);
				htmlBox.getElementsByTagName('span')[0].innerHTML = description_html;
				
				// adjust title with the new checkbox stats -->
				adjustPopupTitleWithCheckboxStats(description_md);
				
				// get card data
				const taskIndex = htmlBox.id.split('_')[1];
				const task = ganttChart.tasks[taskIndex];
				const stackIndex = task2stackCardIndex[taskIndex].stack;
				const cardIndex   = task2stackCardIndex[taskIndex].card;
				const card = boardData.stacks[stackIndex].cards[cardIndex];
				
				// change card description
				const description_md_ = updateDescriptionDates(description_md, task.start, task.progress);
				card.description = description_md_;
				
				// send changed card to API
				const stackId = boardData.stacks[stackIndex].id;
				sendCardData(boardData.id, stackId, card.id, card);
				
				checkbox_changed = true;
			}
			stopInteraction();
		}
		// <---

	
    // <!-- Cookie section -->
        let isFormVisible = true;
		
        // Cookie functions
        function setCookie(name, value, days = 30) {
            const expires = new Date(Date.now() + days * 864e5).toUTCString();
            document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/';
        }

        function getCookie(name) {
            return document.cookie.split('; ').reduce((r, v) => {
                const parts = v.split('=');
                return parts[0] === name ? decodeURIComponent(parts[1]) : r;
            }, '');
        }

        // Load saved data when page loads
        window.onload = function() {
			console.log("isNextcloud:", isNextcloud);
			if(!isNextcloud) {
				// Check if cookies exist and populate form
				const savedUsername = getCookie('username');
				const savedUrl = getCookie('url');
				const savedToken = getCookie('token');
				
				if (savedUsername) {
					document.getElementById('username').value = savedUsername;
				}
				if (savedUrl) {
					document.getElementById('url').value = savedUrl;
				}
				if (savedToken) {
					document.getElementById('token').value = savedToken;
				}
				
				// If all data exists, keep form collapsed initially
				if (savedUsername && savedUrl && savedToken) {
					console.log('Settings loaded from cookies');
				}				
			}
				
			fetchBoards();
        };

        function toggleSettings(enforceAction=null) {
            const form = document.getElementById('settingsForm');
            const arrow = document.getElementById('arrow');
			
			switch(enforceAction) {
				case 'open':
					isFormVisible = false;
				break
				case 'close':
					isFormVisible = true;
				break
			}
            
            if (isFormVisible) {
                form.classList.add('hidden');
                arrow.classList.add('rotated');
            } else {
                form.classList.remove('hidden');
                arrow.classList.remove('rotated');
            }
            
            isFormVisible = !isFormVisible;
        }

        function handleSubmit(event) {
            event.preventDefault();
            
            // Save form data to cookies
            const formData = new FormData(event.target);
		    setCookie('username', formData.get('username'));
            setCookie('url', formData.get('url'));
            setCookie('token', formData.get('token'));
            
			fetchBoards();
        }

		// <!-- Gantt Chart Hight Auto Adjustment -->
	
		// Enhanced version with manual recreation handling
		class GanttHeightManager {
			constructor() {
				this.observers = new Map();
				this.globalObserver = null;
				this.isInitialized = false;
			}
			
			fixGanttHeight() {
				[...document.getElementsByClassName('gantt-container')].forEach(gantt_container => {
					if (gantt_container.firstChild && gantt_container.firstChild.getBBox) {
						const svg_height = gantt_container.firstChild.getBBox().height;
						const height = Math.max(svg_height, 300); 
						gantt_container.style.height = height + 50 + 'px';
					}
				});
				// increase height of bar width handles to solve overlapping with progress handle
				const handle_height = "17";
				[...document.getElementsByClassName('handle right')].forEach(handle => {
					handle.setAttribute("height", handle_height);
				});
				[...document.getElementsByClassName('handle left')].forEach(handle => {
					handle.setAttribute("height", handle_height);
				});

			}
			
			setupObserverForContainer(gantt_container) {
				// Don't observe the same container twice
				if (this.observers.has(gantt_container)) {
					return;
				}
				
				const observer = new MutationObserver((mutations) => {
					let shouldFix = false;
					
					mutations.forEach((mutation) => {
						if (mutation.type === 'childList' || 
							mutation.type === 'attributes' || 
							(mutation.type === 'subtree' && mutation.target.tagName === 'svg')) {
							shouldFix = true;
						}
					});
					
					if (shouldFix) {
						setTimeout(() => this.fixGanttHeight(), 10);
					}
				});
				
				observer.observe(gantt_container, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ['height', 'viewBox', 'style']
				});
				
				this.observers.set(gantt_container, observer);
			}
			
			init() {
				// Fix height for any existing gantt charts
				this.fixGanttHeight();
				
				// Setup observers for existing containers
				[...document.getElementsByClassName('gantt-container')].forEach(container => {
					this.setupObserverForContainer(container);
				});
				
				// Set up global observer to detect new gantt containers being added
				if (!this.globalObserver) {
					this.globalObserver = new MutationObserver((mutations) => {
						let hasNewGantt = false;
						
						mutations.forEach((mutation) => {
							if (mutation.type === 'childList') {
								mutation.addedNodes.forEach((node) => {
									if (node.nodeType === Node.ELEMENT_NODE) {
										// Check if new node is a gantt container or contains one
										if (node.classList && node.classList.contains('gantt-container')) {
											hasNewGantt = true;
										} else if (node.getElementsByClassName) {
											const innerGantts = node.getElementsByClassName('gantt-container');
											if (innerGantts.length > 0) {
												hasNewGantt = true;
											}
										}
									}
								});
							}
						});
						
						if (hasNewGantt) {
							// Small delay to ensure the gantt is fully initialized
							setTimeout(() => {
								this.fixGanttHeight();
								// Setup observers for new containers
								[...document.getElementsByClassName('gantt-container')].forEach(container => {
									this.setupObserverForContainer(container);
								});
							}, 100);
						}
					});
					
					// Watch the entire document for new gantt containers
					this.globalObserver.observe(document.body, {
						childList: true,
						subtree: true
					});
				}
				
				this.isInitialized = true;
			}
			
			// Call this when you recreate gantt charts
			handleGanttRecreation() {
				// Clean up old observers for containers that no longer exist
				this.cleanup();
				
				// Reinitialize for new containers
				this.init();
			}
			
			// Clean up observers for removed containers
			cleanup() {
				const existingContainers = new Set(document.getElementsByClassName('gantt-container'));
				
				for (let [container, observer] of this.observers) {
					if (!existingContainers.has(container)) {
						observer.disconnect();
						this.observers.delete(container);
					}
				}
			}
			
			// Complete cleanup - call when shutting down
			destroy() {
				// Disconnect individual observers
				for (let [container, observer] of this.observers) {
					observer.disconnect();
				}
				this.observers.clear();
				
				// Disconnect global observer
				if (this.globalObserver) {
					this.globalObserver.disconnect();
					this.globalObserver = null;
				}
				
				this.isInitialized = false;
			}
		}

		// Create global instance
		const ganttHeightManager = new GanttHeightManager();

		// Initialize once
		ganttHeightManager.init();

		// Usage when recreating gantt:
		// ganttHeightManager.handleGanttRecreation();

		// Export for use in console
		window.ganttHeightManager = ganttHeightManager;
