#!/usr/bin/perl -w

use strict;
use Data::Dumper;
use Encode;
use utf8;

use POSIX;
#use locale; 
#setlocale LC_CTYPE, 'en_US.UTF-8';

my $limit = shift @ARGV || 0;
binmode STDOUT, ':utf8';
$| = 1;

my @files = glob('mail/*.msg');
print "Got ".scalar(@files)." files\n";

my $info = {};
my $count = 1;
my $total_keys = {};
foreach my $file (@files) {
  open(F, $file)
  or die $@;

  my $tick = <F>;
  chomp($tick);
  unless ($tick =~ /^\d+$/) {
    print STDERR "tick is not a number in $file: $tick\n";
    next;
  }
  my $jshash = <F>;
  chomp($jshash);

  if (my $hash = eval($jshash) ) {
    $info->{$tick} = $hash;
    foreach my $key (keys %$hash) {
      $total_keys->{$key} = 1;
    }
  } else {
    print "can't eval ($@): ".substr($jshash, 0, 50)." ... ".substr($jshash, -50)."\n";
  }
  $count++;
}

my @ticks = sort {$a <=> $b} keys %$info;
if ($limit) {
  @ticks = splice(@ticks, -$limit);
} 
open(STAT, ">stat_total.csv")
or die $@;
print STAT "tick\t".join("\t", sort keys %$total_keys)."\tcreeps\n";
my $run_keys = {};
foreach my $tick (@ticks) {
  my $hash = $info->{$tick};
  print STAT $tick;
  foreach my $key (sort keys %$total_keys) {
    my $value = exists $hash->{$key}->{cpu} ? $hash->{$key}->{cpu} : 0;
    $value =~ s/\./,/;
    print STAT "\t$value";
  }
  my $creeps = 0;
  if (exists $hash->{"run"}->{"info"}) {
    foreach my $v (values %{$hash->{"run"}->{"info"}}) {
      $creeps += $v->{sum};
    }
  } else {
    $creeps = 0;
  }
  print STAT "\t$creeps";
  print STAT "\n";

  my $run = $hash->{"run"}->{"info"};
  foreach my $key (keys %$run) {
    $run_keys->{$key} = 1;
  }
}
close(STAT);

open(RUN, ">stat_run.csv")
or die $@;
print RUN "tick\t".join("\t", sort keys %$run_keys)."\n";
foreach my $tick (@ticks) {
  my $hash = $info->{$tick};
  my $run = $hash->{"run"}->{"info"};
  print RUN $tick;
  foreach my $key (sort keys %$run_keys) {
    my $value = exists $run->{$key} ? sprintf("%0.2f", $run->{$key}->{"cpu"} / $run->{$key}->{"sum"}) : 0;
    $value =~ s/\./,/;
    print RUN "\t$value";
  }
  print RUN "\n";
}
close(RUN);