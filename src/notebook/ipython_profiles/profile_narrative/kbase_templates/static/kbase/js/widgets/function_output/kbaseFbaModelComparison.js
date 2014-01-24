(function( $, undefined ) {

$.KBWidget({
    name: "FbaModelComparisonWidget",     
    version: "1.0.0",
    options: {
    	token: null,
    	ws_name: null,
    	fba_model1: null, 
    	fba_model2: null,
    	proteome_cmp: null
    },

    wsUrl: "http://kbase.us/services/workspace/",

    init: function(options) {
        var self = this;
        this._super(options);
        var container = this.$elem;
    	var panel = $('<div class="loader-table">Please wait...</div>');
    	container.append(panel);
    	var pref = (new Date()).getTime();
        var kbws = new workspaceService(this.wsUrl);

        var cmp = null;
        
        kbws.get_object({auth: options.token, workspace: options.ws_name, id: options.proteome_cmp, type: 'ProteomeComparison'}, function(data) {
        	cmp = data.data;
        	dataIsReady();
        }, function(data) {
        	alert("Error: " + data.error.message)
        });

        var dataIsReady = function() {
        	$('.loader-table').remove();
        	var headTable = $('<table cellpadding="0" cellspacing="0" border="0" class="table table-striped table-bordered" style="margin:0;">');
        	container.append(headTable);
        	var tables = ['Common reactions', 'Model1 only', 'Model2 only'];
            var tableIds = [pref+'common', pref+'model1', pref+'model2'];
            // build tabs
            var tabs = $('<ul id="'+pref+'table-tabs" class="nav nav-tabs"> \
                            <li class="active" > \
                            <a href="#'+tableIds[0]+'" data-toggle="tab" style="text-decoration:none">'+tables[0]+'</a> \
                          </li></ul>');
            for (var i=1; i<tableIds.length; i++) {
                tabs.append('<li><a href="#'+tableIds[i]+'" data-toggle="tab" style="text-decoration:none">'+tables[i]+'</a></li>');
            }
            // add tabs
            container.append(tabs);
            var tab_pane = $('<div id="tab-content" class="tab-content">')
            // add table views (don't hide first one)
            tab_pane.append('<div class="tab-pane in active" id="'+tableIds[0]+'"> \
                                <table cellpadding="0" cellspacing="0" border="0" id="'+tableIds[0]+'-table" \
                                class="table table-bordered table-striped" style="width: 100%; margin:0;"></table>\
                            </div>');
            for (var i=1; i<tableIds.length; i++) {
                var tableDiv = $('<div class="tab-pane in" id="'+tableIds[i]+'"> ');
                var table = $('<table cellpadding="0" cellspacing="0" border="0" id="'+tableIds[i]+'-table" \
                                class="table table-striped table-bordered" style="margin:0;">');
                tableDiv.append(table);
                tab_pane.append(tableDiv);
            }
            container.append(tab_pane)
        	var model1 = options.fba_model1;
        	var model2 = options.fba_model2;
        	var model1map = {};
        	for (var i in model1.reactions) {
        		var r = model1.reactions[i];
        		model1map[r.id] = r;
        	}
        	var model2map = {};
        	for (var i in model2.reactions) {
        		var r = model2.reactions[i];
        		model2map[r.id] = r;
        	}
        	var model1only = [];
        	for (var i in model1.reactions) {
        		var r = model1.reactions[i];
        		if (!model2map.hasOwnProperty(r.id))
        			model1only.push(r);
        	}
        	var model2only = [];
        	for (var i in model2.reactions) {
        		var r = model2.reactions[i];
        		if (!model1map.hasOwnProperty(r.id))
        			model2only.push(r);
        	}
        	var tableSettings = {
                    "sPaginationType": "full_numbers",
                    "iDisplayLength": 5,
                    "aaData": [],
                    "oLanguage": {
                        "sSearch": "Search all:"
                    }
                };
        	//////////////////////////////////////////// Common tab /////////////////////////////////////////////
            var stat = [0,0];
            var dataDict = formatRxnObjs(model1.reactions, model2map, stat);
            headTable.append("<tr><td></td><td>Reactions in genome1</td><td>Reactions in genome2</td><td>Common reactions</td><td>Reactions with same features</td></tr>");
            headTable.append("<tr><td>Statistics:</td><td><center>" + model1.reactions.length + "</center></td><td><center>" + model2.reactions.length + "</center></td>" +
            		"<td><center>" + stat[0] + "</center></td><td><center>" + stat[1] + "</center></td></tr>");
            var keys = ["reaction", "definition", "features1", "features2", "name"];
            var labels = ["Reaction", "Equation", "Features from genome1", "Features from genome2", "Name"];
            var cols = getColumns(keys, labels);
            var rxnTableSettings = $.extend({}, tableSettings, {fnDrawCallback: rxnEvents});   
            rxnTableSettings.aoColumns = cols;
            var table = $('#'+pref+'common-table').dataTable(rxnTableSettings);
            table.fnAddData(dataDict);
        	//////////////////////////////////////////// Model1 only tab ////////////////////////////////////////
            var dataDict = formatRxnObjs(model1only, null, null);
            var keys = ["reaction", "definition", "features1", "name"];
            var labels = ["Reaction", "Equation", "Features from genome 1", "Name"];
            var cols = getColumns(keys, labels);
            var rxnTableSettings = $.extend({}, tableSettings, {fnDrawCallback: rxnEvents});   
            rxnTableSettings.aoColumns = cols;
            var table = $('#'+pref+'model1-table').dataTable(rxnTableSettings);
            table.fnAddData(dataDict);
        	//////////////////////////////////////////// Model2 only tab ////////////////////////////////////////
            var dataDict = formatRxnObjs(model2only, null, null);
            var keys = ["reaction", "definition", "features1", "name"];
            var labels = ["Reaction", "Equation", "Features from genome 2", "Name"];
            var cols = getColumns(keys, labels);
            var rxnTableSettings = $.extend({}, tableSettings, {fnDrawCallback: rxnEvents});   
            rxnTableSettings.aoColumns = cols;
            var table = $('#'+pref+'model2-table').dataTable(rxnTableSettings);
            table.fnAddData(dataDict);
            container.append($('<table><tr><td>(*) color legend: sub-best bidirectional hits are marked by <font color="blue">blue</font>, '+
            		'orphan features are marked by <font color="red">red</font>.</td></tr></table>'));
            
            function formatRxnObjs(rxnObjs, map2, stat) {
                var rxn_objs = []
                for (var i in rxnObjs) {
                	var r1 = rxnObjs[i];
                    var rxn = $.extend({}, r1);
                    rxn.reaction = '<a class="rxn-click" data-rxn="'+rxn.reaction+'">'
                                +rxn.reaction+'</a> ('+rxn.compartment+')';
                    if (map2 != null) {
                    	if (map2.hasOwnProperty(r1.id)) {
                    		if (stat != null)
                    			stat[0]++;
                        	var p1map = {};
                        	for (var i in r1.features) {
                        		var f1 = r1.features[i];
                        		p1map[f1] = cmp.proteome1map[f1];
                        	}
                        	var r2 = map2[r1.id];
                        	var p2map = {};
                        	for (var i in r2.features) {
                        		var f2 = r2.features[i];
                        		p2map[f2] = cmp.proteome2map[f2];
                        	}
                        	var f1list = [];
                        	var f1orfans = [];
                        	var f2list = [];
                        	var exactly = true;
                        	for (var i in r1.features) {
                        		var f1 = r1.features[i];
                        		var hits = cmp.data1[cmp.proteome1map[f1]];
                        		var links = [];
                        		var sublinks = [];
                        		for (var h in hits) {
                        			var hit = hits[h];
                        			if (p2map.hasOwnProperty(cmp.proteome2names[hit[0]])) {
                        				if (hit[2] == 100) {
                        					links.push(cmp.proteome2names[hit[0]]);
                        				} else {
                        					sublinks.push('<font color="blue">' + cmp.proteome2names[hit[0]] + '</font>');
                        				}
                        			}
                        		}
                        		if (links.length == 0 && sublinks.length == 0) {
                        			f1orfans.push('<font color="red">' + f1 + '</font>');
                        			exactly = false;
                        		} else if (links.length > 0) {
                        			f1list.push(f1);
                        			f2list.push(links);
                        		} else {
                        			f1list.push('<font color="blue">' + f1 + '</font>');
                        			f2list.push(sublinks);
                        			exactly = false;
                        		}
                        	}
                        	for (var item in f1orfans)
                        		f1list.push(f1orfans[item]);
                        	for (var i in r2.features) {
                        		var f2 = r2.features[i];
                        		var hits = cmp.data2[cmp.proteome2map[f2]];
                        		var links = [];
                        		for (var h in hits) {
                        			var hit = hits[h];
                        			if (p1map.hasOwnProperty(cmp.proteome1names[hit[0]])) {
                        				links.push(cmp.proteome1names[hit[0]]);
                        			}
                        		}
                        		if (links.length == 0) {
                        			f2list.push('<font color="red">' + f2 + '</font>');
                        			exactly = false;
                        		}
                        	}                        	
                            rxn.features1 = f1list.join('<br>');
                            rxn.features2 = f2list.join('<br>');
                        	rxn_objs.push(rxn);
                        	if (exactly && stat != null)
                        		stat[1]++;
                    	}
                    } else {
                        rxn.features1 = rxn.features.join('<br>');
                    	rxn_objs.push(rxn);
                    }
                }
                return rxn_objs;
            }
            function getColumns(keys, labels) {
                var cols = [];
                for (var i=0; i<keys.length; i++) {
                    cols.push({sTitle: labels[i], mData: keys[i]})
                }
                return cols;
            }
            function rxnEvents() {
                $('.rxn-click').unbind('click');
                $('.rxn-click').click(function() {
                    var rxn = [$(this).data('rxn')];
                    alert("Reaction: " + rxn);
                });            
            }
    	};
        return this;
    }  //end init

})
}( jQuery ) );
