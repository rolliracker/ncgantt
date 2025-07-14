"use strict";

	//Gantt Chart Hight Auto Adjustment ----->
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

	// <---
