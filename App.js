Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'header_box'},
        {xtype:'container',itemId:'display_box', layout: {type: 'hbox'}}
    ],
    aggregateNumberField: 'ValueScore',
    modelType: 'PortfolioItem/Feature',
    modelObject: undefined,
    riskMapping: [{
        name: 'R3',
        color: '#FF0000'
    },{
        name: 'R2',
        color: '#EE6C19'
    },{
        name: 'R1',
        color: '#FAD200'
    },{
        name: 'Not Started',
        color: '#F6F6F6'
    },{
        name: 'Done',
        color: '#3F86C9'
    }],

    launch: function() {
        var promises = [this._fetchModel(),this._fetchChildProjects()];
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(results){
                console.log('model', results);
                this.modelObject = results[0];
                this.childProjectHash = results[1];
                this._addSelectorComponents();
            },
            failure: function(operation){
                Rally.ui.notify.Notifier.showError('Error retrieving child projects: ' + operation.error.errors.join(','));
            }
        });

    },
    _fetchModel: function(){
        var deferred = Ext.create('Deft.Deferred');

        Rally.data.ModelFactory.getModel({
            type: this.modelType,
            success: function(model) {
                deferred.resolve(model);
            }
        });
        return deferred;
    },
    _fetchReleases: function(cb){
        var deferred = Ext.create('Deft.Deferred'),
        release_name = cb.getRecord().get('Name');
        
        var store = Ext.create('Rally.data.wsapi.Store',{
            model: 'Release',
            fetch: ['ObjectID','Name'],
            filters: [{
                property: 'Name',
                value: release_name 
            }]
        });
        
        store.load({
            scope: this,
            callback: function(records, operation, success){
               if (success) {
                   console.log('release records', records);
                   this._fetchData(records);
               } else {
                   Rally.ui.notify.Notifier.showError({message: 'Error getting Releases: ' + operation.error.errors.join(',')});

               }
            }
        });
        return deferred;  
    },
    _fetchChildProjects: function(){
        var deferred = Ext.create('Deft.Deferred');
        
        var store = Ext.create('Rally.data.wsapi.Store',{
            model: 'Project',
            fetch: ['Name','ObjectID'],
            filters: [{
                property: 'Parent.ObjectID',
                value: this.getContext().getProject().ObjectID
            }],
            limit: Infinity
        });
        
        store.load({
            scope: this,
            callback: function(records, operation, success){
                if (success){
                    var projectHash = {};
                    _.each(records, function(r){
                        projectHash[r.get('ObjectID')] = r.get('Name');
                    });

                    deferred.resolve(projectHash);
                } else {
                    deferred.reject(operation);
                }
            }
        });
        return deferred;  
    },
    _addSelectorComponents: function(){
        this.down('#header_box').add({
            xtype: 'rallyreleasecombobox',
            fieldLabel: 'Release',
            labelAlign: 'right',
            context: {
                project: this.getContext().getProject()._ref,
                projectScopeDown: this.getContext().getProjectScopeDown(),
                projectScopeUp: false
            },
            allowNoEntry: false,
            width: 300,
            listeners: {
                scope: this,
                change: this._fetchReleases
            }
        });
    },
    _fetchData: function(releases){
        var model_name = 'PortfolioItem/Feature',
            field_names = ['FormattedID','Name','State', '_ProjectHierarchy'].concat([this.aggregateNumberField]),
            release_oids = _.map(releases, function(rel){ return rel.get('ObjectID');});

        this.setLoading(true);

        var store = Ext.create('Rally.data.lookback.SnapshotStore',{
            fetch: field_names,
            find: {
                '_TypeHierarchy': model_name,
                '_ProjectHierarchy': this.getContext().getProject().ObjectID,
                'Release': {$in: release_oids},
                '__At': "current"
            }
        });

        store.load({
            scope: this,
            callback: function(records, operation, success){
                if (success){
                    console.log('records', records);
                    this._buildGridAndChart(records);
                    this.setLoading(false);
                } else {
                    this.setLoading(false);
                    Rally.ui.notify.Notifier.showError({message: 'Error fetching data: ' + operation.error.errors.join(',')});
                }
            }
        });
    },
    _buildGridAndChart: function(records){
        this.down('#display_box').removeAll();

        var aggregate_data = this._aggregateData(records);

        this._buildGridView(aggregate_data);

        this._buildChart(aggregate_data);
    },
    _buildChart: function(aggregate_data){

        var ct = this.down('#display_box').add({
            xtype: 'container',
            flex: 2
        });

        var colors = [];
        _.each(this.riskMapping, function(rm){
            colors.push(rm.color);
        });

        var chart = ct.add({
            xtype: 'rallychart',
            itemId: 'rally-chart',
            chartConfig: this._getChartConfig(),
            chartData: this._getChartData(aggregate_data),
            chartColors: colors
        });

    },
    _getChartData: function(aggregate_data){

        var categories = _.keys(aggregate_data),
            riskCategories = [],
            series = [];

        _.each(this.riskMapping, function(riskMap){
            riskCategories.push(riskMap);
        });
console.log('riskCategories', riskCategories);
        for (var j = 0; j < riskCategories.length; j++) {
            var series_obj = {name: riskCategories[j].name, data: [], color: riskCategories[j].color};
            for (var i = 0; i < categories.length; i++) {
                series_obj.data.push(aggregate_data[categories[i]][riskCategories[j].name].length);
            }
            series.push(series_obj);
        }
        console.log('categories', categories, 'series', series);
        return {
            categories: categories,
            series: series
        };
    },
    _getChartConfig: function(){

        return {
            chart: {
                type: 'column'
            },
            title: {
                text: 'Risk'
            },
            legend: {
                align: 'right',
                x: -30,
                verticalAlign: 'top',
                y: 25,
                floating: true,
                backgroundColor:  'white',
                borderColor: '#CCC',
                borderWidth: 1,
                shadow: false
            },
            tooltip: {
                formatter: function () {
                    return '<b>' + this.x + '</b><br/>' +
                        this.series.name + ': ' + this.y + '<br/>' +
                        'Total: ' + this.point.stackTotal;
                }
            },
            plotOptions: {
                column: {
                    stacking: 'normal',
                    dataLabels: {
                        enabled: true,
                        color: 'white',
                        style: {
                            textShadow: '0 0 3px black'
                        }
                    }
                }
            }
        };
    },
    _buildGridView: function(aggregate_data){
        console.log('_buildGridView', aggregate_data);

        var items = [];

        _.each(aggregate_data, function(obj, proj){
            var risk_items = [];
            _.each(obj, function(records, riskCategory){

                var risk_store = Ext.create('Rally.data.custom.Store',{
                    pageSize: records.length,
                    data: records
                });

                risk_items.push({
                    title: riskCategory + ' (' + records.length + ')',
                    items: [{
                        xtype: 'rallygrid',
                        store: risk_store,
                        columnCfgs: [{
                            dataIndex: 'FormattedID', text: 'Formatted ID'
                        },{
                            dataIndex: 'Name', text: 'Name', flex: 1
                        }],
                        showPagingToolbar: false,
                        showRowActionsColumn: false
                    }]
                });
            }, this);

            var risk_pnl = Ext.create('Ext.panel.Panel',{
                title: proj,
                flex: 1,
                defaults: {
                    bodyStyle: 'padding:15px'
                },
                layout: {
                    type: 'accordion',
                    titleCollapse: false,
                    animate: true
                },
                items: risk_items
            });
            items.push(risk_pnl);
        }, this);

        var pnl = Ext.create('Ext.panel.Panel', {
            flex: 1,
           // width: 300,
           // height: 300,
            defaults: {
                // applied to each contained panel
                bodyStyle: 'padding:15px'
            },
            layout: {
                // layout-specific configs go here
                type: 'accordion',
                titleCollapse: false,
                animate: true,
                activeOnTop: true
            },
            items: items
        });
        this.down('#display_box').add(pnl);

    },
    _aggregateData: function(records){
        var aggregate_data = {},
            risk_categories = [];

        console.log('child project hash', this.childProjectHash);

        _.each(this.riskMapping, function(obj){
            risk_categories.push(obj.name);
        });

        _.each(records, function(rec){
            var proj = this._getProjectCategory(rec),
                risk_category = this._getRiskCategory(rec, this.aggregateNumberField);

            if (!aggregate_data[proj]){
                aggregate_data[proj] = {};
                _.each(risk_categories, function(rc){
                    aggregate_data[proj][rc] = [];
                });
            }
            aggregate_data[proj][risk_category].push(rec);

        }, this);
        return aggregate_data;
    },
    _getProjectCategory: function(rec){
        var project_hierarchy = rec.get('_ProjectHierarchy'),
            current_project_idx = _.indexOf(project_hierarchy, this.getContext().getProject().ObjectID);
            console.log('proj hierarchy', project_hierarchy, current_project_idx);
            if (current_project_idx < 0){
                return 'Unknown';
            }

            if (this.getContext().getProject().ObjectID == project_hierarchy.slice(-1)[0]){
                return this.getContext().getProject().Name;
            }

            //Project Hierarchy is like this:  [P0, P1, P2, P3] where P3 is the project that the item is in
            var project_category_oid = project_hierarchy[current_project_idx + 1];
            return this.childProjectHash[project_category_oid];
    },
    _getRiskCategory: function(rec, riskField){
        //var risk = rec.get(riskField) || 0;
        //
        //if (risk <= 10){
        //    return 'R1';
        //}
        //
        //if (risk <= 20){
        //    return 'R2';
        //}
        //return 'R3';
//#  Inputs:
//#    percentComplete (real)
//#    startDate (days since the epoch or date type where
//#      Tomorrow()-Today() = 1.0 (real))
//#    endDate (same type as startDate)
//#    asOfDate (same type as startDate) - Most often today. The naming of
//#      this variable supports the idea that you may want to look
//#      at the report as-of a certain date. All A2.0 reports will
//#      support printing any report as-of a certain timestamp.
//#    acceptanceStartDelay (real representing days) - delay before any
//#      any movement off of 0% complete is expected
//#    warningDelay (real representing days) - width of yellow
//#    inProgress (boolean)
//
//#  Colors:
//            #    Red - Late
//#    Green - On Track
//#    Yellow - At Risk
//#    White - Not Started
//#    Light Gray - Some Work Accepted Prior to Start Date
//#    Gray - Complete
//
//# Input parameters for Portfolio Items are calculated as below.
//# They could be different for Epics
//            asOfDay = <today>
//# percentDoneFieldName in the line below could be:
//            #   PercentDoneByStoryCount or PercentDoneByStoryPlanEstimate
//        percentComplete = 100 * PI[percentDoneFieldName]


        var startDate = new Date(),
            percentComplete = 100 * rec.get('PercentDoneByStoryCount');
        if (rec.get('ActualStartDate')) {
            startDate = rec.get('ActualStartDate');
        }
        else if (rec.get('PlannedStartDate')) {
            startDate = rec.get('PlannedStartDate');
        }

        var endDate = new Date();
        if (percentComplete == 100) {
            if (rec.get('ActualEndDate')) {
                endDate = rec.get('ActualEndDate');
            }
            else if (rec.get('PlannedEndDate')) {
                endDate = rec.get('PlannedEndDate');
            }
        } else {
            if (rec.get('PlannedEndDate')){
                endDate = rec.get('PlannedEndDate');
            }
        }

//# Defaults below currently hard-coded. Could later be provided by user.
        var deltaDays = Rally.util.DateTime.getDifference(endDate,startDate,'day'),
            acceptanceStartDelay = deltaDays * 0.2,
            warningDelay = deltaDays * 0.2,
            inProgress = percentComplete > 0;

        if (new Date() < startDate){
            return 'Not Started';
        }

        if (new Date() >= endDate){
            if (percentComplete >= 100){
                //return colors.gray;
                return 'Done';
            } else {
                return 'R3';
            }
        }

        var startDay = 0,
            asOfDay = Rally.util.DateTime.getDifference(new Date(), startDate, 'day'),
            endDay = deltaDays;


        var redXIntercept = startDay + acceptanceStartDelay + warningDelay,
            redSlope = 100.0 / (endDay - redXIntercept),
            redYIntercept = -1.0 * redXIntercept * redSlope,
            redThreshold = redSlope * asOfDay + redYIntercept;
        if (percentComplete < redThreshold){
            return 'R3';
        }

        var yellowXIntercept = startDay + acceptanceStartDelay,
            yellowSlope = 100 / (endDay - yellowXIntercept),
            yellowYIntercept = -1.0 * yellowXIntercept * yellowSlope,
            yellowThreshold = yellowSlope * asOfDay + yellowYIntercept;

        if (percentComplete < yellowThreshold){
            return 'R2';
        }
        return 'R1';
    }
});
