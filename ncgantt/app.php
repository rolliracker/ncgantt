<?php
\OCP\App::registerAdmin('ncgantt', 'admin');

// Register navigation entry with icon
\OC::$server->getNavigationManager()->add([
    'id' => 'ncgantt',
    'order' => 10,
    'href' => \OC::$server->getURLGenerator()->linkToRoute('ncgantt.page.index'),
    'icon' => \OC::$server->getURLGenerator()->imagePath('ncgantt', 'app.svg'),
    'name' => 'Gantt Chart',
]);