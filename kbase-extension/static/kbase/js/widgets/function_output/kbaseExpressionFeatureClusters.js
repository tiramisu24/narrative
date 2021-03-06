/**
 * Output widget to vizualize FeatureClusters object.
 * Pavel Novichkov <psnovichkov@lbl.gov>
 * @public
 */

define (
    [
        'jquery',
        'knhx',
        'base/js/namespace',
        'kbwidget',
        'narrativeConfig',
        'util/string',
        'kbaseAuthenticatedWidget',
        'kbaseTabs',
        'kbaseTreechart',
        'kbaseExpressionSparkline',
        'kbaseExpressionHeatmap',
        'kbaseExpressionPairwiseCorrelation',
        'kb_common/jsonRpc/genericClient',
        // For effect
        'jquery-dataTables',
        'bootstrap'
    ], function(
        $,
        knhx,
        Jupyter,
        KBWidget,
        Config,
        StringUtil,
        kbaseAuthenticatedWidget,
        kbaseTabs,
        kbaseTreechart,
        kbaseExpressionSparkline,
        kbaseExpressionHeatmap,
        kbaseExpressionPairwiseCorrelation,
        ServiceClient
    ) {
        'use strict';

        return KBWidget({
            name: 'kbaseExpressionFeatureClusters',
            parent : kbaseAuthenticatedWidget,
            version: '1.0.0',
            options: {
                clusterSetID: null,
                workspaceID: null,
                loadingImage: Config.get('loading_gif'),
            },

            // Extracted data for vizualization
            clusterSet: null,
            expMatrixRef: null,
            expMatrixName: null,
            genomeRef: null,
            featureMapping: null,
            matrixRowIds: null,
            matrixColIds: null,
            genomeID: null,
            genomeName: null,
            features: null,

            init: function(options) {
                this._super(options);
                // Create a message pane
                this.$messagePane = $('<div/>').addClass('kbwidget-message-pane kbwidget-hide-message');
                this.$elem.append(this.$messagePane);
                return this;
            },

            loggedInCallback: function(event, auth) {


                // error if not properly initialized
                if (this.options.clusterSetID == null) {
                    this.showMessage('[Error] Couldn\'t retrieve clusters');
                    return this;
                }

                // Create a new workspace client
                this.ws = new ServiceClient({
                    module: 'Workspace',
                    url: Config.url('workspace'),
                    token: auth.token 
                });

                // Let's go...
                this.loadAndRender();

                return this;
            },

            loggedOutCallback: function() {
                this.ws = null;
                this.isLoggedIn = false;
                return this;
            },

            loadAndRender: function(){
                var self = this;

                self.loading(true);

                var clusterSetRef = self.buildObjectIdentity(this.options.workspaceID, this.options.clusterSetID);

                // Note order of calls is important here; state is stored in the object.
                // TODO
                this.ws.callFunc('get_objects', [[clusterSetRef]])
                    .spread(function(data) {
                        self.clusterSet = data[0].data;
                        self.expMatrixRef = self.clusterSet.original_data;

                        return self.ws.callFunc('get_object_subset', [[{ 
                            ref: self.expMatrixRef, 
                            included: ['/genome_ref', '/feature_mapping', '/data/row_ids', '/data/col_ids'] 
                        }]])
                            .spread(function(result) {
                                var data = result[0];
                                self.expMatrixName = data.info[1];
                                self.genomeRef = data.data.genome_ref;
                                self.featureMapping = data.data.feature_mapping;
                                self.matrixRowIds = data.data.data.row_ids;
                                self.matrixColIds = data.data.data.col_ids;

                                if (self.genomeRef) {
                                    return self.ws.callFunc('get_object_subset', [[{ 
                                        ref: self.genomeRef, 
                                        included: ['/id', '/scientific_name', '/features/[*]/id', 'features/[*]/type',
                                            'features/[*]/function', 'features/[*]/aliases'] 
                                    }]])
                                        .spread(function(result) {
                                            var data = result[0];
                                            self.genomeID = data.info[1];
                                            self.genomeName = data.data.scientific_name;
                                            self.features = data.data.features;
                                            self.render();
                                        })
                                        .catch(function(error){
                                            console.error(error);
                                            self.render();
                                        });                                    
                                } else {
                                    self.render();
                                }
                            })
                            .catch(function(error){
                                console.error('ERROR', error);
                                self.clientError(error);
                            });                        
                    })
                    .catch(function(error){
                        console.error('ERROR', error);
                        self.clientError(error);
                    });                
            },

            render: function(){
                var self = this;
                var $container = this.$elem;
                var pref = StringUtil.uuid();
                self.pref = pref;


                self.loading(false);

                ///////////////////////////////////// Instantiating Tabs ////////////////////////////////////////////
                $container.empty();
                var tabPane = $('<div id="'+pref+'tab-content">');
                $container.append(tabPane);

                var tabWidget = new kbaseTabs(tabPane, {canDelete : true, tabs : []});
                ///////////////////////////////////// Overview table ////////////////////////////////////////////
                var tabOverview = $('<div/>');
                tabWidget.addTab({tab: 'Overview', content: tabOverview, canDelete : false, show: true});
                var tableOver = $('<table class="table table-striped table-bordered" '+
                'style="width: 100%; margin-left: 0px; margin-right: 0px;" id="'+pref+'overview-table"/>');
                tabOverview.append(tableOver);
                tableOver
                    .append( self.makeRow(
                        'Feature clusters',
                        self.clusterSet.feature_clusters.length ) )
                // .append( self.makeRow(
                // 	'Condition clusters',
                // 	self.clusterSet.condition_clusters.length ) )
                    .append( self.makeRow(
                        'Genome',
                        $('<span />').append(self.genomeName).css('font-style', 'italic') ) )
                    .append( self.makeRow(
                        'Expression matrix',
                        self.expMatrixName ) )
                    .append( self.makeRow(
                        'Expression matrix: #conditions',
                        self.matrixColIds.length ) )
                    .append( self.makeRow(
                        'Expression matrix: #genes',
                        self.matrixRowIds.length ) )
                ;

                ///////////////////////////////////// Clusters tab ////////////////////////////////////////////

                var $tabClusters = $('<div/>');
                tabWidget.addTab({tab: 'Clusters', content: $tabClusters, canDelete : false, show: false});

                ///////////////////////////////////// Clusters table ////////////////////////////////////////////

                self.buildActionMenu($container);
                $(document).mousedown( function(e){
                    // Hide menu on mousedown only if we are not inside the menu
                    if(e.target.getAttribute('methodInput') == null){
                        self.$menu.hide();
                    }
                });

                $('<table id="'+pref+'clusters-table" \
                class="table table-bordered table-striped" style="width: 100%; margin-left: 0px; margin-right: 0px;">\
                </table>')
                    .appendTo($tabClusters)
                    .dataTable( {
                        'sDom': 'lftip',
                        'aaData': self.buildClustersTableData(),
                        'aoColumns': [
                            { sTitle: 'Pos.', mData:'pos' },
                            { sTitle: 'Cluster', mData:'clusterId' },
                            { sTitle: 'Number of genes', mData:'size' },
                            { sTitle: 'Mean correlation', mData:'meancor' },
                            { sTitle: '', mData: 'rowIndex',
                                mRender: function ( rowIndex ) {
                                    return '<button class="btn btn-default ' + pref + 'action_button" rowIndex="' + rowIndex +'" >Explore Cluster  <span class="caret"></span></button>';
                                }
                            }
                        ],
                        'fnDrawCallback': events
                    } );

                function events() {
                    self.registerActionButtonClick(tabWidget);
                    updateClusterLinks('clusters');
                }

                function updateClusterLinks(showClass) {
                    $('.show-'+showClass+'_'+self.pref).unbind('click');
                    $('.show-'+showClass+'_'+self.pref).click(function() {
                        var pos = $(this).data('pos');
                        var tabName = 'Cluster ' + pos;
                        if (tabWidget.hasTab(tabName)) {
                            tabWidget.showTab(tabName);
                            return;
                        }
                        var tabDiv = $('<div/>');
                        tabWidget.addTab({tab: tabName, content: tabDiv, canDelete : true, show: true, deleteCallback: function(name) {
                            tabWidget.removeTab(name);
                        }});
                        self.buildClusterFeaturesTable(tabDiv, pos);
                        tabWidget.showTab(tabName);
                    });
                }

                ///////////////////////////////////// Features tab ////////////////////////////////////////////
                var featureTabDiv = $('<div/>');
                tabWidget.addTab({tab: 'Features', content: featureTabDiv, canDelete : false, show: false});
                self.buildClusterFeaturesTable(featureTabDiv, null, function() {
                    updateClusterLinks('clusters2');
                });

            ///////////////////////////////////// Hierarchical dendrogram tab ////////////////////////////////////////////
            /*var newick = self.clusterSet.feature_dendrogram;
            if (newick) {
                var tree = kn_parse(newick);
                var root = self.transformKnhxTree(tree.root, 10);
                console.log(JSON.stringify(root.children[0].children[0].children[0].children[0]));
                var tabDendro = $("<div style='max-height: 600px;'/>");
                tabWidget.addTab({tab: 'Dendrogram', content: tabDendro, canDelete : false, show: false});
                var dendroPanel = $("<div/>");
                tabDendro.append(dendroPanel);
                 new kbaseTreechart(dendroPanel, {
                    lineStyle: 'square',
                    dataset: root
                });
            }*/
            },

            transformKnhxTree: function(node, scale) {
                var ret = {};
                if (node.d > 0) {
                    ret.distance = node.d * scale;
                } else {
                    ret.distance = 0;
                }
                if (node.child && node.child.length > 0) {
                    var children = [];
                    ret.children = children;
                    for (var i = 0; i < node.child.length; i++)
                        children.push(this.transformKnhxTree(node.child[i], scale));
                } else {
                    ret.name = 'Name: ' + node.name;
                }
                return ret;
            },

            registerActionButtonClick : function( tabWidget ){
                var self = this;
                var pref = self.pref;
                $('.' + pref + 'action_button').on('click', function(e){

                    var $actionButton = $(e.target);
                    if ($actionButton.prop('tagName') !== 'BUTTON')
                        $actionButton = $actionButton.parent();
                    var x = $actionButton.position().left;
                    var y = $actionButton.position().top + $actionButton[0].offsetHeight;
                    self.$menu
                        .data('invokedOn', $actionButton)
                        .css({
                            position: 'absolute',
                            left: x,
                            top: y
                        })
                        .show()
                        .off('click')
                        .on('click', 'a', function (e) {
                            self.$menu.hide();

                            var $invokedOn = self.$menu.data('invokedOn');
                            var $selectedMenu = $(e.target);
                            var rowIndex = $invokedOn[0].getAttribute('rowIndex');
                            var methodInput = $selectedMenu[0].getAttribute('methodInput');


                            if (methodInput === 'build_feature_set') {
                                /* exercise left for the reader */
                                /* IPython.narrative.createAndRunMethod(methodInput,
                            {
                              'input_genome':self.genomeID,
                              'input_feature_ids': geneIds.join(","),
                              'output_feature_set': self.options.clusterSetID + "_Cluster"+rowIndex+"_Features",
                              'description': 'Features were selected from Cluster ' + rowIndex + ' of a FeatureClusters data object '+
                                      'named ' + self.options.clusterSetID + '.'
                            }
                          ); */
                                Jupyter.narrative.addAndPopulateApp('KBaseFeatureValues/build_feature_set', 'release', {
                                    'input_genome':self.genomeRef,
                                    'input_feature_ids': self.getClusterGeneIds(rowIndex),
                                    'output_feature_set': self.options.clusterSetID + '_Cluster'+rowIndex+'_Features',
                                    'description': 'Features were selected from Cluster ' + rowIndex + ' of a FeatureClusters data object '+
                                      'named ' + self.options.clusterSetID + '.'
                                });
                            }
                            else {

                                var nameMap = {
                                    view_expression_profile : 'Expression profile',
                                    view_expression_pairwise_correlation : 'Pairwise correlation',
                                    view_expression_heatmap : 'Heatmap'
                                };

                                var tabName = nameMap[methodInput] + ' for cluster_' + rowIndex;

                                var geneIds = self.getClusterGeneIds(rowIndex);

                                var $contentDiv = $('<div></div>');

                                tabWidget.addTab({tab: tabName, content: $contentDiv, canDelete : true, show: true});

                                var methodMap = {
                                    view_expression_profile : kbaseExpressionSparkline,
                                    view_expression_pairwise_correlation : kbaseExpressionPairwiseCorrelation,
                                    view_expression_heatmap : kbaseExpressionHeatmap
                                };

                                new methodMap[methodInput]($contentDiv, {
                                    geneIds : geneIds.join(','),
                                    expressionMatrixID : self.expMatrixName,
                                    workspaceID : self.options.workspaceID
                                });
                            }

                        });

                });
            },

            getClusterGeneIds: function(rowIndex){
                var geneIds = [];
                for(var geneId in this.clusterSet.feature_clusters[rowIndex].id_to_pos){
                    geneIds.push(geneId);
                }
                return geneIds;
            },

            buildClustersTableData: function(){
                var self = this;
                // var row_ids = self.expressionMatrix.data.row_ids;
                // var col_ids = self.expressionMatrix.data.col_ids;
                var feature_clusters  = self.clusterSet.feature_clusters;

                var tableData = [];

                var cluster;
                for(var i = 0; i < feature_clusters.length; i++){
                    cluster = feature_clusters[i];
                    tableData.push({
                        pos: i,
                        clusterId: '<a class=\'show-clusters_' + self.pref + '\' data-pos=\''+i+'\'>cluster_' + i + '</a>',
                        size: Object.keys(cluster.id_to_pos).length,
                        meancor : cluster.meancor != null? cluster.meancor.toFixed(3) : 'N/A',
                        rowIndex : i
                    });
                }

                return tableData;
            },

            buildActionMenu: function($container){
                var $menu = $(' \
                <ul id="contextMenu" class="dropdown-menu" role="menu" style="display:none; list-style:none; margin:0" > \
                    <li><a tabindex="-1" href="#" methodInput="view_expression_profile">View expression profile</a></li> \
                    <li><a tabindex="-1" href="#" methodInput="view_expression_pairwise_correlation">View pairwise correlation</a></li> \
                    <li><a tabindex="-1" href="#" methodInput="view_expression_heatmap">View in sortable condition heatmap</a></li> \
                    <li class="divider"></li> \
                    <li><a tabindex="-1" href="#" methodInput="build_feature_set">Create a FeatureSet</a></li> \
                </ul> \
            ');


                /* XXX

          This doesn't work yet. It'll need to go up into the string above, inside the ul.

          The known issue is that it's trying to pass in an object reference (or name or whatever) into the create feature set app, but that
          was designed on the explicit assumption that it'd only be given names of objects within the current narrative. But this would hand in
          a full ref to an object in another workspace, which the app can't handle.

          Once the code is updated to allow something like that, we can re-enable it. The rest of the wiring should be ready to go.
        */

                    // <li class="divider"></li> \
                    // <li><a tabindex="-1" href="#" methodInput="build_feature_set">Create a FeatureSet</a></li> \

                $container.append($menu);
                this.$menu = $menu;
            },

            buildClusterFeaturesTable: function(tabDiv, pos, events) {
                var self = this;
                var tableData = [];
                var table = $('<table class="table table-bordered table-striped" '+
                    'style="width: 100%; margin-left: 0px; margin-right: 0px;"></table>');
                tabDiv.append(table);

                var id2features = self.buildFeatureId2FeatureHash();
                var min_cluster_pos = 0;
                var max_cluster_pos = self.clusterSet.feature_clusters.length - 1;
                if (pos != null) {
                    min_cluster_pos = pos;
                    max_cluster_pos = pos;
                }
                for (var cluster_pos = min_cluster_pos; cluster_pos <= max_cluster_pos; cluster_pos++)
                    for (var rowId in self.clusterSet.feature_clusters[cluster_pos].id_to_pos) {
                        var fid = rowId;
                        if (self.featureMapping) {
                            fid = self.featureMapping[rowId];
                            if (!fid)
                                fid = rowId;
                        }
                        var gid = '-';
                        var genomeRef = null;
                        if (self.genomeRef) {
                            genomeRef = self.genomeRef.split('/')[0] + '/' + self.genomeID;
                            gid = '<a href="/#dataview/'+genomeRef+'" target="_blank">'+
                    self.genomeName+'</a>';
                        }
                        var aliases = '-';
                        var type = '-';
                        var func = '-';
                        var feature = id2features[fid];
                        if (feature) {
                            if(feature.aliases && feature.aliases.length > 0)
                                aliases= feature.aliases.join(', ');
                            type = feature.type;
                            func = feature['function'];
                        }
                        if (genomeRef) {
                            fid = '<a href="/#dataview/'+genomeRef+'?sub=Feature&subid='+fid +
                    '" target="_blank">'+fid+'</a>';
                        }
                        tableData.push(
                            {
                                fid: fid,
                                cid: '<a class=\'show-clusters2_' + self.pref + '\' data-pos=\''+cluster_pos+'\'>cluster_' + cluster_pos + '</a>',
                                gid: gid,
                                ali: aliases,
                                type: type,
                                func: func
                            }
                        );
                    }
                var columns = [];
                columns.push({sTitle: 'Feature ID', mData: 'fid'});
                if (pos == null)
                    columns.push({ sTitle: 'Cluster', mData:'cid' });
                columns.push({sTitle: 'Aliases', mData: 'ali'});
                columns.push({sTitle: 'Genome', mData: 'gid'});
                columns.push({sTitle: 'Type', mData: 'type'});
                columns.push({sTitle: 'Function', mData: 'func'});
                table.dataTable( {
                    'sDom': 'lftip',
                    'aaData': tableData,
                    'aoColumns': columns,
                    'fnDrawCallback': events
                });

                return tabDiv;
            },

            buildFeatureId2FeatureHash: function(){
                var self = this;
                var features = self.features;
                var id2features = {};
                if (features)
                    for(var i in features)
                        id2features[features[i].id] = features[i];
                return id2features;
            },

            makeRow: function(name, value) {
                var $row = $('<tr/>')
                    .append($('<th />').css('width','20%').append(name))
                    .append($('<td />').append(value));
                return $row;
            },

            getData: function() {
                return {
                    type: 'ExpressionMatrix',
                    id: this.options.expressionMatrixID,
                    workspace: this.options.workspaceID,
                    title: 'Expression Matrix'
                };
            },

            loading: function(isLoading) {
                if (isLoading)
                    this.showMessage('<img src=\'' + this.options.loadingImage + '\'/>');
                else
                    this.hideMessage();
            },

            showMessage: function(message) {
                var span = $('<span/>').append(message);

                this.$messagePane.append(span);
                this.$messagePane.show();
            },

            hideMessage: function() {
                this.$messagePane.hide();
                this.$messagePane.empty();
            },

            buildObjectIdentity: function(workspaceID, objectID, objectVer, wsRef) {
                var obj = {};
                if (wsRef) {
                    obj['ref'] = wsRef;
                } else {
                    if (/^\d+$/.exec(workspaceID))
                        obj['wsid'] = workspaceID;
                    else
                        obj['workspace'] = workspaceID;

                    // same for the id
                    if (/^\d+$/.exec(objectID))
                        obj['objid'] = objectID;
                    else
                        obj['name'] = objectID;

                    if (objectVer)
                        obj['ver'] = objectVer;
                }
                return obj;
            },

            clientError: function(error){
                this.loading(false);
                this.showMessage(error.error.error);
            }

        });
    });
