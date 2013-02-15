enyo.kind({
	name: "Ares.App",
	kind: "FittableColumns",
	classes: "enyo-fit",
	handlers: {
		ondragleave: "iframeDragleave"
	},
	components: [
		{name: "client", fit: true, classes:"enyo-fit",
			ondragleave: "dragleave", ondown: "down", ondragstart: "dragstart", ondragover: "dragover", ondrop: "drop"
		},
		{name: "serializer", kind: "Serializer"},
		{name: "communicator", kind: "RPCCommunicator", onMessage: "receiveMessage"}
	],
	
	selectedItem: null,
	parentInstance: null,
	
	create: function() {
		this.inherited(arguments);
		this.addHandlers();
	},
	rendered: function() {
		this.inherited(arguments);
		this.sendMessage({op: "state", val: "ready"});
	},
	
	sendMessage: function(inMessage) {
		this.$.communicator.sendMessage(inMessage);
	},
	receiveMessage: function(inSender, inEvent) {
		var msg = inEvent.message;
		
		if(msg.op === "render") {
			if(this.renderKind(msg.val.name)) {
				this.kindUpdated();
			}
		} else if(msg.op === "select") {
			this.selectItem(msg.val);
		} else if(msg.op === "highlight") {
			this.highlightItem(msg.val);
		} else if(msg.op === "modify") {
			this.modifyProperty(msg.val);
		} else if(msg.op === "unhighlight") {
			this.unhighlightDropTargets();
		} else if(msg.op === "drop") {
			this.simulateDrop(msg.val);
		}
	},
	
	/**
		Response to message sent from Deimos. Highlight the specified conrol
		and send a message with a serialized copy of the control.
	*/
	selectItem: function(inItem) {
		this.selectedItem = null;
		
		for(var i=0, c;(c=this.flattenChildren(this.$.client.children)[i]);i++) {
			if(c.id === inItem.id) {
				this.selectedItem = c;
				this.highlightSelectedItem();
			} else {
				this.unHighlightItem(c);
			}
		}
		
		this.sendMessage({op: "selected", val: this.$.serializer.serializeComponent(this.selectedItem)});
	},
	//* Set _inItem_ to _this.selected_ and notify Deimos
	directSelectItem: function(inItem) {
		this.selectedItem = inItem;
		this.highlightSelectedItem();
		this.sendMessage({op: "select", val: this.$.serializer.serializeComponent(this.selectedItem)});
	},
	highlightItem: function(inItem) {
		for(var i=0, c;(c=this.flattenChildren(this.$.client.children)[i]);i++) {
			if(c.id === inItem.id) {
				this.highlightDropTarget(c);
			} else if(c !== this.selectedItem) {
				this.unHighlightItem(c);
			}
		}
	},
	unhighlightDropTargets: function(inItem) {
		for(var i=0, c;(c=this.flattenChildren(this.$.client.children)[i]);i++) {
			if(c !== this.selectedItem) {
				this.unHighlightItem(c);
			}
		}
	},
	//* When a drop happens in the component view, translate that to a drop in this iframe.
	simulateDrop: function(inDropData) {
		var itemId   = inDropData.item,
			targetId = inDropData.target,
			item = null,
			target = null;
		
		for(var i=0, c;(c=this.flattenChildren(this.$.client.children)[i]);i++) {
			if(c.id === itemId) {
				item = c;
			} else if(c.id === targetId) {
				target = c;
			}
		}
		
		this.unhighlightDropTargets();
		
		// Make sure item wasn't dropped on itself or it's children (TODO)
		if(target === null || item === target) {
			return;
		}
		
		this.dropControl(item, target);
	},
	modifyProperty: function(inData) {
		this.selectedItem[inData.property] = inData.value;
		this.refreshClient();
	},
	
	//* Render the specified kind into the iFrame
	renderKind: function(inKindName) {
		var kindConstructor = window[inKindName];
		
		if(!kindConstructor) {
			this.log("No constructor exists for ", inKindName);
			return false;
		} else if(!kindConstructor.prototype) {
			this.log("No prototype exists for ", inKindName);
			return false;
		}
		
		this.$.client.destroyClientControls();
		var kindComponents = this.flattenKindComponents(kindConstructor.prototype.kindComponents);
		this.makeKindComponentsDraggable(kindComponents);
		this.flagAresComponents(kindComponents);
		
		this.parentInstance = this.$.client.createComponent({kind: inKindName}).render();
		
		return true;
	},
	//* Send update to Deimos with serialized copy of current kind component structure
	kindUpdated: function() {
		this.sendMessage({op: "rendered", val: this.$.serializer.serialize(this.parentInstance)});
	},
	
	//* Get each kind component individually
	flattenKindComponents: function(inComponents) {
		var ret = [],
			cs,
			c;
		
		for (var i=0;(c = inComponents[i]);i++) {
			ret.push(c);
			if(c.components) {
				cs = this.flattenKindComponents(c.components);
				for (var j=0;(c = cs[j]);j++) {
					ret.push(c);
				}
			}
		}
		
		return ret;
	},
	flattenChildren: function(inComponents) {
		var ret = [],
			cs,
			c;
		
		for (var i=0;(c = inComponents[i]);i++) {
			ret.push(c);
			if(c.children) {
				cs = this.flattenChildren(c.children);
				for (var j=0;(c = cs[j]);j++) {
					ret.push(c);
				}
			}
		}
		
		return ret;
	},
	
	//* Add the attribute _draggable="true"_ to each kind component
	makeKindComponentsDraggable: function(inComponents) {
		for(var i=0,child;(child = inComponents[i]);i++) {
			this.makeComponentDraggable(child);
		}
	},
	makeComponentDraggable: function(inComponent) {
		if(inComponent.attributes) {
			inComponent.attributes.draggable =  true;
			inComponent.attributes.dropTarget = true;
		} else {
			inComponent.attributes = {
				draggable:  true,
				dropTarget: true
			};
		}
	},
	//* Flag components that are interactive in the designer with _aresComponent=true_
	flagAresComponents: function(inComponents) {
		for(var i=0, c;(c = inComponents[i]);i++) {
			this.flagAresComponent(c);
		}
	},
	flagAresComponent: function(inComponent) {
		inComponent.aresComponent = true;
	},
	getAresComponents: function(inContainer) {
		// TODO
	},
	
	down: function(inSender, inEvent) {
		// If this item isn't an ares component, find it's parent that is
		inEvent.originator = this.updateDragOriginator(inEvent.originator);
		
		if(!inEvent.originator || !inEvent.originator.aresComponent) {
			return false;
		}
		
		this.directSelectItem(inEvent.originator);
	},
	dragstart: function(inSender, inEvent) {
		if(!inEvent.dataTransfer) {
			return false;
		}

		inEvent.dataTransfer.setData('Text', this.$.serializer.serializeComponent(this.selectedItem));
        return true;
	},
	dragover: function(inSender, inEvent) {
		if(!inEvent.dataTransfer) {
			return false;
		}
		
		inEvent.preventDefault();
		
		inEvent.originator = this.updateDragOriginator(inEvent.originator);
		
		if(!inEvent.originator || inEvent.originator === this.selectedItem) {
			this.currentDropTarget = null;
			this.syncDropTargetHighlighting();
			return false;
		}
		
		if(this.currentDropTarget && this.currentDropTarget === inEvent.originator) {
			return false;
		}
		
		this.currentDropTarget = inEvent.originator;
		this.highlightDropTarget(this.currentDropTarget);
		this.syncDropTargetHighlighting();
		
		return true;
	},
	dragleave: function(inSender, inEvent) {
		if(!inEvent.dataTransfer) {
			return false;
		}
		
		inEvent.originator = this.updateDragOriginator(inEvent.originator);
		
		if(!inEvent.originator || inEvent.originator === this.selectedItem) {
			return false;
		}
		
		this.unHighlightItem(inEvent.originator);
		this.syncDropTargetHighlighting();
		
		return true;
	},
	iframeDragleave: function(inSender, inEvent) {
		// TODO - unhighlight all when dragging out of iframe.
	},
	drop: function(inSender, inEvent) {
		var dropData;
		
		if(!inEvent.dataTransfer) {
			return false;
		}
		
		inEvent.originator = this.updateDragOriginator(inEvent.originator);
		
		if(!inEvent.originator || inEvent.originator === this.selectedItem) {
			return false;
		}
		
		dropData = enyo.json.codify.from(inEvent.dataTransfer.getData("Text"));
		
		this.currentDropTarget = null;
		
		this.unhighlightDropTargets();
		this.syncDropTargetHighlighting();
		
		if(dropData.id) {
			this.dropControl(this.getControlById(dropData.id), inEvent.originator);
		} else if(dropData.op && dropData.op === "newControl") {
			this.createNewComponent(dropData, inEvent.originator);
		}
		
        return true;
	},
	getControlById: function(inId) {
		for(var i=0, c;(c=this.flattenChildren(this.$.client.children)[i]);i++) {
			if(c.id === inId) {
				return c;
			}
		}
	},
	
	updateDragOriginator: function(inComponent) {
		return (!this.isDropTarget(inComponent)) ? this.findNextDropTarget(inComponent) : inComponent;
	},
	isDropTarget: function(inComponent) {
		return (inComponent.attributes && inComponent.attributes.dropTarget);
	},
	findNextDropTarget: function(inComponent) {
		return (!inComponent.owner) ? null : (this.isDropTarget(inComponent.owner)) ? inComponent.owner : this.findNextDropTarget(inComponent.owner);
	},
	highlightDropTarget: function(inComponent) {
		if(typeof inComponent.origBackground === "undefined") {
			inComponent.origBackground = inComponent.domStyles.background || null;
			inComponent.applyStyle("background","#cedafe");
		}
	},
	//* Highlight _this.selectedItem_ and unhighlight everything else
	highlightSelectedItem: function() {
		if(typeof this.selectedItem.origBackground === "undefined") {
			this.selectedItem.origBackground = this.selectedItem.domStyles.background || null;
			this.selectedItem.applyStyle("background","orange");
		}
		for(var i=0, c;(c = this.flattenChildren(this.$.client.children)[i]);i++) {
			if(c !== this.selectedItem) {
				this.unHighlightItem(c);
			}
		}
	},
	unHighlightItem: function(inComponent) {
		if(typeof inComponent.origBackground !== "undefined") {
			inComponent.applyStyle("background", inComponent.origBackground);
			inComponent.origBackground = undefined;
		}
	},
	syncDropTargetHighlighting: function() {
		var dropTarget = this.currentDropTarget ? this.$.serializer.serializeComponent(this.currentDropTarget) : null;
		this.sendMessage({op: "syncDropTargetHighlighting", val: dropTarget});
	},
	
	
	/**
		Create an object copy of the _inDroppedControl_, then destroy and recreate it
		as a child of _inTargetControl_
	*/
	dropControl: function(inDroppedControl, inTargetControl) {
		var droppedControlCopy = this.getSerializedCopyOfComponent(inDroppedControl),
			newComponent;
		
		inDroppedControl.destroy();
		
		// Add needed flags to new component
		this.makeComponentDraggable(droppedControlCopy);
		this.flagAresComponent(droppedControlCopy);
		newComponent = inTargetControl.createComponent(droppedControlCopy, {owner: this.parentInstance});
		
		this.refreshClient();
		// Maintain selected state
		this.directSelectItem(newComponent);
	},
	/**
		Create a new component, brought in from the Palette. This component's initial properties
		are defined in the design.js file associated with the current library.
	*/
	createNewComponent: function(inNewComponent, inDropTarget) {
		this.makeComponentDraggable(inNewComponent);
		this.flagAresComponent(inNewComponent);
		
		var newComponent = inDropTarget.createComponent(inNewComponent, {owner: this.parentInstance});
		
		// If we have a placeholder name, set it accordingly
		if(newComponent.getContent() === "$name") {
			newComponent.setContent(newComponent.name);
		}

		this.refreshClient();
		// Select the newly added item
		this.directSelectItem(newComponent);
	},
	getSerializedCopyOfComponent: function(inComponent) {
		return enyo.json.codify.from(this.$.serializer.serializeComponent(inComponent));
	},
	refreshClient: function() {
		this.$.client.render();
		this.kindUpdated();
	},
	
	
	//* Add dispatch for native drag events
	addHandlers: function(inSender, inEvent) {
		document.ondragstart = enyo.dispatch;
		document.ondrag =      enyo.dispatch;
		document.ondragenter = enyo.dispatch;
		document.ondragleave = enyo.dispatch;
		document.ondragover =  enyo.dispatch;
		document.ondrop =      enyo.dispatch;
		document.ondragend =   enyo.dispatch;
	}
});
